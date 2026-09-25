import type { ContentStore } from "@/lib/content-store";
import { newPermanentId } from "@/lib/ids";
import { publishAudits } from "@/lib/learner-collections";
import type { PublishAudit, QuestionVersion } from "@/lib/learner-types";

export type PublishLine = {
  question_version_id: string;
  outcome: "PUBLISHED" | "REJECTED";
  reason: string | null;
};

export type PublishResult = {
  ok: boolean;
  reason: string | null;
  lines: PublishLine[];
};

const BLOCKED_BY_BATCH =
  "Not published because another selected version was rejected.";

export function planPublish(
  questionVersionIds: string[],
  existing: Map<string, QuestionVersion>,
): PublishResult & { versions: QuestionVersion[] } {
  const ids = questionVersionIds.map((id) => id.trim()).filter((id) => id.length > 0);
  if (ids.length === 0) {
    return {
      ok: false,
      reason: "Select at least one staged question.",
      lines: [],
      versions: [],
    };
  }

  const uniqueIds = [...new Set(ids)];
  const lines: PublishLine[] = uniqueIds.map((question_version_id) => {
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
        reason: "Only a staged version can be published.",
      };
    }
    if (!version.active || !version.valid || !version.complete) {
      return {
        question_version_id,
        outcome: "REJECTED",
        reason: "This version is not active, valid, and complete.",
      };
    }
    return { question_version_id, outcome: "PUBLISHED", reason: null };
  });

  if (lines.some((line) => line.outcome === "REJECTED")) {
    return {
      ok: false,
      reason: "Nothing was published.",
      lines: lines.map((line) =>
        line.outcome === "PUBLISHED"
          ? { ...line, outcome: "REJECTED", reason: BLOCKED_BY_BATCH }
          : line,
      ),
      versions: [],
    };
  }

  const versions = uniqueIds.map((question_version_id) => {
    const version = existing.get(question_version_id);
    if (!version) {
      throw new Error("planned publish is missing a version");
    }
    return { ...version, publication_status: "PUBLISHED" as const };
  });

  return { ok: true, reason: null, lines, versions };
}

export async function publishStagedVersions(
  store: ContentStore,
  questionVersionIds: string[],
): Promise<PublishResult> {
  const ids = [
    ...new Set(
      questionVersionIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
  const existing = await store.getVersions(ids);
  const plan = planPublish(questionVersionIds, existing);
  if (plan.ok) {
    await store.upsertVersions(plan.versions);
  }
  return { ok: plan.ok, reason: plan.reason, lines: plan.lines };
}

export async function recordPublishAudit(input: {
  actorAdminId: string;
  questionVersionIds: string[];
  outcome: PublishAudit["outcome"];
  reason: string | null;
  now?: Date;
}): Promise<void> {
  const audit: PublishAudit = {
    audit_id: newPermanentId(),
    actor_admin_id: input.actorAdminId,
    occurred_at: input.now ?? new Date(),
    question_version_ids: input.questionVersionIds,
    outcome: input.outcome,
    reason: input.reason,
  };
  await (await publishAudits()).insertOne(audit);
}
