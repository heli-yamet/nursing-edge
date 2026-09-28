import type { ContentStore } from "@/lib/content-store";
import { newPermanentId } from "@/lib/ids";
import { pauseAudits } from "@/lib/learner-collections";
import type { PauseAudit, QuestionVersion } from "@/lib/learner-types";

export type PauseLine = {
  question_version_id: string;
  outcome: "PAUSED" | "REJECTED";
  reason: string | null;
};

export type PauseResult = {
  ok: boolean;
  reason: string | null;
  lines: PauseLine[];
};

const BLOCKED_BY_BATCH =
  "Not paused because another selected version was rejected.";

export function planPause(
  questionVersionIds: string[],
  existing: Map<string, QuestionVersion>,
): PauseResult & { versions: QuestionVersion[] } {
  const ids = questionVersionIds.map((id) => id.trim()).filter((id) => id.length > 0);
  if (ids.length === 0) {
    return {
      ok: false,
      reason: "Select at least one published question.",
      lines: [],
      versions: [],
    };
  }

  const uniqueIds = [...new Set(ids)];
  const lines: PauseLine[] = uniqueIds.map((question_version_id) => {
    const version = existing.get(question_version_id);
    if (!version) {
      return {
        question_version_id,
        outcome: "REJECTED",
        reason: "This question version was not found.",
      };
    }
    if (version.publication_status !== "PUBLISHED") {
      return {
        question_version_id,
        outcome: "REJECTED",
        reason: "Only a published version can be paused.",
      };
    }
    if (!version.active) {
      return {
        question_version_id,
        outcome: "REJECTED",
        reason: "This version is already paused.",
      };
    }
    return { question_version_id, outcome: "PAUSED", reason: null };
  });

  if (lines.some((line) => line.outcome === "REJECTED")) {
    return {
      ok: false,
      reason: "Nothing was paused.",
      lines: lines.map((line) =>
        line.outcome === "PAUSED"
          ? { ...line, outcome: "REJECTED", reason: BLOCKED_BY_BATCH }
          : line,
      ),
      versions: [],
    };
  }

  const versions = uniqueIds.map((question_version_id) => {
    const version = existing.get(question_version_id);
    if (!version) {
      throw new Error("planned pause is missing a version");
    }
    return { ...version, active: false };
  });

  return { ok: true, reason: null, lines, versions };
}

export async function pausePublishedVersions(
  store: ContentStore,
  questionVersionIds: string[],
): Promise<PauseResult> {
  const ids = [
    ...new Set(
      questionVersionIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
  const existing = await store.getVersions(ids);
  const plan = planPause(questionVersionIds, existing);
  if (plan.ok) {
    await store.upsertVersions(plan.versions);
  }
  return { ok: plan.ok, reason: plan.reason, lines: plan.lines };
}

export async function recordPauseAudit(input: {
  actorAdminId: string;
  questionVersionIds: string[];
  outcome: PauseAudit["outcome"];
  reason: string | null;
  now?: Date;
}): Promise<void> {
  const audit: PauseAudit = {
    audit_id: newPermanentId(),
    actor_admin_id: input.actorAdminId,
    occurred_at: input.now ?? new Date(),
    question_version_ids: input.questionVersionIds,
    outcome: input.outcome,
    reason: input.reason,
  };
  await (await pauseAudits()).insertOne(audit);
}
