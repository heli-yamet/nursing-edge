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
  const prepared = input.records.map((record) => ({
    record,
    line_id: newPermanentId(),
    validated: validateImportQuestion(record),
  }));

  const versionIds = [
    ...new Set(
      prepared.flatMap((item) =>
        item.validated.ok ? [item.validated.version.question_version_id] : [],
      ),
    ),
  ];
  const questionIds = [
    ...new Set(
      prepared.flatMap((item) =>
        item.validated.ok ? [item.validated.question.question_id] : [],
      ),
    ),
  ];

  const [existingVersions, existingQuestions] = await Promise.all([
    store.getVersions(versionIds),
    store.getQuestions(questionIds),
  ]);
  const attempted = await store.versionsWithAttempts([
    ...existingVersions.keys(),
  ]);

  const questionsToWrite = new Map<string, Question>();
  const versionsToWrite = new Map<string, QuestionVersion>();
  const lines: ImportLine[] = [];

  for (const item of prepared) {
    if (!item.validated.ok) {
      lines.push({
        line_id: item.line_id,
        batch_id,
        question_id: item.record.permanent_item_id.trim(),
        question_version_id: item.record.question_version.trim(),
        workbook_row: String(item.record.workbook_row),
        outcome: "FAILED",
        errors: item.validated.errors,
      });
      continue;
    }

    const incomingVersion = item.validated.version;
    const incomingQuestion = item.validated.question;
    const existing = existingVersions.get(incomingVersion.question_version_id) ?? null;
    const hasAttempt = existing
      ? attempted.has(existing.question_version_id)
      : false;
    const plan = planVersionWrite(incomingVersion, existing, hasAttempt);

    let outcome: ImportLineOutcome = "PASSED";
    let errors: string[] = [];

    if (plan.kind === "fail") {
      outcome = "FAILED";
      errors = [plan.error];
    } else if (plan.kind === "unchanged") {
      outcome = "UNCHANGED";
    } else {
      const question = mergeQuestion(
        existingQuestions.get(incomingQuestion.question_id) ?? null,
        incomingQuestion,
      );
      const staged = {
        ...incomingVersion,
        publication_status: "STAGED" as const,
      };
      existingQuestions.set(question.question_id, question);
      existingVersions.set(staged.question_version_id, staged);
      questionsToWrite.set(question.question_id, question);
      versionsToWrite.set(staged.question_version_id, staged);
    }

    lines.push({
      line_id: item.line_id,
      batch_id,
      question_id: incomingQuestion.question_id,
      question_version_id: incomingVersion.question_version_id,
      workbook_row: incomingQuestion.workbook_row,
      outcome,
      errors,
    });
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

  await Promise.all([
    store.upsertQuestions([...questionsToWrite.values()]),
    store.upsertVersions([...versionsToWrite.values()]),
    store.insertLines(lines),
  ]);
  await store.insertBatch(batch);

  return { batch, lines };
}
