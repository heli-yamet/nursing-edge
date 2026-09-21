import type { Clock } from "@/lib/clock";
import { systemClock } from "@/lib/clock";
import type { ContentStore } from "@/lib/content-store";
import {
  validateImportQuestion,
  type ImportQuestionInput,
} from "@/lib/content-validate";
import { newPermanentId } from "@/lib/ids";
import type {
  ImportBatch,
  ImportLine,
  ImportLineOutcome,
  Question,
  QuestionVersion,
} from "@/lib/learner-types";

export function isLearnerEligible(version: QuestionVersion): boolean {
  return (
    version.publication_status === "PUBLISHED" &&
    version.active &&
    version.valid &&
    version.complete
  );
}

export type VersionWritePlan =
  | { kind: "insert" }
  | { kind: "overwrite" }
  | { kind: "unchanged" }
  | { kind: "fail"; error: string };

export function planVersionWrite(
  incoming: QuestionVersion,
  existing: QuestionVersion | null,
  hasAttempt: boolean,
): VersionWritePlan {
  if (!existing) {
    return { kind: "insert" };
  }

  if (existing.content_fingerprint === incoming.content_fingerprint) {
    return { kind: "unchanged" };
  }

  if (existing.publication_status === "PUBLISHED" || hasAttempt) {
    return {
      kind: "fail",
      error:
        "question_version already exists with different content and is frozen",
    };
  }

  return { kind: "overwrite" };
}

function mergeQuestion(existing: Question | null, incoming: Question): Question {
  if (!existing) {
    return incoming;
  }

  return {
    ...incoming,
    status: existing.status,
  };
}

export type StageImportInput = {
  records: ImportQuestionInput[];
  source?: string;
};

export type StageImportResult = {
  batch: ImportBatch;
  lines: ImportLine[];
};

export async function stageImport(
  store: ContentStore,
  input: StageImportInput,
  clock: Clock = systemClock,
): Promise<StageImportResult> {
  const batch_id = newPermanentId();
  const created_at = clock.now();
  const source = input.source ?? "records";
  const lines: ImportLine[] = [];

  for (const record of input.records) {
    const validated = validateImportQuestion(record);
    const line_id = newPermanentId();

    if (!validated.ok) {
      const line: ImportLine = {
        line_id,
        batch_id,
        question_id: record.permanent_item_id.trim(),
        question_version_id: record.question_version.trim(),
        workbook_row: String(record.workbook_row),
        outcome: "FAILED",
        errors: validated.errors,
      };
      await store.insertLine(line);
      lines.push(line);
      continue;
    }

    const existing = await store.getVersion(
      validated.version.question_version_id,
    );
    const hasAttempt = existing
      ? await store.versionHasAttempts(existing.question_version_id)
      : false;
    const plan = planVersionWrite(validated.version, existing, hasAttempt);

    let outcome: ImportLineOutcome = "PASSED";
    let errors: string[] = [];

    if (plan.kind === "fail") {
      outcome = "FAILED";
      errors = [plan.error];
    } else if (plan.kind === "unchanged") {
      outcome = "UNCHANGED";
    } else {
      const question = mergeQuestion(
        await store.getQuestion(validated.question.question_id),
        validated.question,
      );
      await store.upsertQuestion(question);
      await store.upsertVersion({
        ...validated.version,
        publication_status: "STAGED",
      });
    }

    const line: ImportLine = {
      line_id,
      batch_id,
      question_id: validated.question.question_id,
      question_version_id: validated.version.question_version_id,
      workbook_row: validated.question.workbook_row,
      outcome,
      errors,
    };
    await store.insertLine(line);
    lines.push(line);
  }

  const batch: ImportBatch = {
    batch_id,
    created_at,
    source,
    line_count: lines.length,
    passed_count: lines.filter((line) => line.outcome === "PASSED").length,
    failed_count: lines.filter((line) => line.outcome === "FAILED").length,
    unchanged_count: lines.filter((line) => line.outcome === "UNCHANGED")
      .length,
  };
  await store.insertBatch(batch);

  return { batch, lines };
}
