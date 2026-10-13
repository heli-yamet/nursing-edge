import type { ContentStore } from "@/lib/content-store";
import { newPermanentId } from "@/lib/ids";
import { deleteAudits } from "@/lib/learner-collections";
import type { DeleteAudit, QuestionVersion } from "@/lib/learner-types";

export type DeleteLine = {
  question_version_id: string;
  outcome: "DELETED" | "REJECTED";
  reason: string | null;
};

export type DeleteResult = {
  ok: boolean;
  reason: string | null;
  lines: DeleteLine[];
};

const BLOCKED_BY_BATCH =
  "Not deleted because another selected version was rejected.";

function uniqueTrimmedIds(questionVersionIds: string[]): string[] {
  return [
    ...new Set(
      questionVersionIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
}

export function planDelete(
  questionVersionIds: string[],
  existing: Map<string, QuestionVersion>,
  attempted: Set<string>,
  reservedVersionIds: Set<string>,
): DeleteResult & { questionIds: string[] } {
  const uniqueIds = uniqueTrimmedIds(questionVersionIds);
  if (uniqueIds.length === 0) {
    return {
      ok: false,
      reason: "Select at least one staged question.",
      lines: [],
      questionIds: [],
    };
  }

  const lines: DeleteLine[] = uniqueIds.map((question_version_id) => {
    const version = existing.get(question_version_id);
    if (!version) {
      return {
        question_version_id,
        outcome: "REJECTED",
        reason: "This question version was not found.",
      };
    }
    if (version.publication_status !== "STAGED") {
      return {
        question_version_id,
        outcome: "REJECTED",
        reason: "Only a staged version can be deleted.",
      };
    }
    if (attempted.has(question_version_id)) {
      return {
        question_version_id,
        outcome: "REJECTED",
        reason: "This version has attempts and stays in the bank.",
      };
    }
    if (reservedVersionIds.has(question_version_id)) {
      return {
        question_version_id,
        outcome: "REJECTED",
        reason: "Remove this version from the Calibration set before deleting it.",
      };
    }
    return { question_version_id, outcome: "DELETED", reason: null };
  });

  if (lines.some((line) => line.outcome === "REJECTED")) {
    return {
      ok: false,
      reason: "Nothing was deleted.",
      lines: lines.map((line) =>
        line.outcome === "DELETED"
          ? { ...line, outcome: "REJECTED", reason: BLOCKED_BY_BATCH }
          : line,
      ),
      questionIds: [],
    };
  }

  const questionIds = [
    ...new Set(
      uniqueIds.map((question_version_id) => {
        const version = existing.get(question_version_id);
        if (!version) {
          throw new Error("planned delete is missing a version");
        }
        return version.question_id;
      }),
    ),
  ];

  return { ok: true, reason: null, lines, questionIds };
}

export async function deleteStagedVersions(
  store: ContentStore,
  questionVersionIds: string[],
  reservedVersionIds: Set<string> = new Set(),
): Promise<DeleteResult> {
  const ids = uniqueTrimmedIds(questionVersionIds);
  const [existing, attempted] = await Promise.all([
    store.getVersions(ids),
    store.versionsWithAttempts(ids),
  ]);
  const plan = planDelete(
    questionVersionIds,
    existing,
    attempted,
    reservedVersionIds,
  );
  if (!plan.ok) {
    return { ok: false, reason: plan.reason, lines: plan.lines };
  }

  await store.deleteVersions(ids);
  const remaining = await store.listQuestionVersions();
  const stillPresent = new Set(remaining.map((version) => version.question_id));
  const orphanQuestionIds = plan.questionIds.filter(
    (question_id) => !stillPresent.has(question_id),
  );
  await store.deleteQuestions(orphanQuestionIds);
  return { ok: true, reason: null, lines: plan.lines };
}

export async function recordDeleteAudit(input: {
  actorAdminId: string;
  questionVersionIds: string[];
  outcome: DeleteAudit["outcome"];
  reason: string | null;
  now?: Date;
}): Promise<void> {
  const audit: DeleteAudit = {
    audit_id: newPermanentId(),
    actor_admin_id: input.actorAdminId,
    occurred_at: input.now ?? new Date(),
    question_version_ids: input.questionVersionIds,
    outcome: input.outcome,
    reason: input.reason,
  };
  await (await deleteAudits()).insertOne(audit);
}
