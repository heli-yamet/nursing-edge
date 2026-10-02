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

export type ResumeLine = {
  question_version_id: string;
  outcome: "RESUMED" | "REJECTED";
  reason: string | null;
};

export type ResumeResult = {
  ok: boolean;
  reason: string | null;
  lines: ResumeLine[];
};

type ActiveChange<Outcome extends string> = {
  targetActive: boolean;
  outcome: Outcome;
  emptyReason: string;
  notPublishedReason: string;
  alreadyReason: string;
  nothingReason: string;
  blockedReason: string;
};

type ChangeLine<Outcome extends string> = {
  question_version_id: string;
  outcome: Outcome | "REJECTED";
  reason: string | null;
};

const PAUSE: ActiveChange<"PAUSED"> = {
  targetActive: false,
  outcome: "PAUSED",
  emptyReason: "Select at least one published question.",
  notPublishedReason: "Only a published version can be paused.",
  alreadyReason: "This version is already paused.",
  nothingReason: "Nothing was paused.",
  blockedReason: "Not paused because another selected version was rejected.",
};

const RESUME: ActiveChange<"RESUMED"> = {
  targetActive: true,
  outcome: "RESUMED",
  emptyReason: "Select at least one paused question.",
  notPublishedReason: "Only a paused published version can be resumed.",
  alreadyReason: "This version is not paused.",
  nothingReason: "Nothing was resumed.",
  blockedReason: "Not resumed because another selected version was rejected.",
};

function uniqueTrimmedIds(questionVersionIds: string[]): string[] {
  return [
    ...new Set(
      questionVersionIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
}

function planActiveChange<Outcome extends string>(
  change: ActiveChange<Outcome>,
  questionVersionIds: string[],
  existing: Map<string, QuestionVersion>,
): {
  ok: boolean;
  reason: string | null;
  lines: ChangeLine<Outcome>[];
  versions: QuestionVersion[];
} {
  const uniqueIds = uniqueTrimmedIds(questionVersionIds);
  if (uniqueIds.length === 0) {
    return { ok: false, reason: change.emptyReason, lines: [], versions: [] };
  }

  const lines: ChangeLine<Outcome>[] = uniqueIds.map((question_version_id) => {
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
        reason: change.notPublishedReason,
      };
    }
    if (version.active === change.targetActive) {
      return {
        question_version_id,
        outcome: "REJECTED",
        reason: change.alreadyReason,
      };
    }
    return { question_version_id, outcome: change.outcome, reason: null };
  });

  if (lines.some((line) => line.outcome === "REJECTED")) {
    return {
      ok: false,
      reason: change.nothingReason,
      lines: lines.map((line) =>
        line.outcome === change.outcome
          ? { ...line, outcome: "REJECTED", reason: change.blockedReason }
          : line,
      ),
      versions: [],
    };
  }

  const versions = uniqueIds.map((question_version_id) => {
    const version = existing.get(question_version_id);
    if (!version) {
      throw new Error("planned change is missing a version");
    }
    return { ...version, active: change.targetActive };
  });

  return { ok: true, reason: null, lines, versions };
}

export function planPause(
  questionVersionIds: string[],
  existing: Map<string, QuestionVersion>,
): PauseResult & { versions: QuestionVersion[] } {
  return planActiveChange(PAUSE, questionVersionIds, existing);
}

export function planResume(
  questionVersionIds: string[],
  existing: Map<string, QuestionVersion>,
): ResumeResult & { versions: QuestionVersion[] } {
  return planActiveChange(RESUME, questionVersionIds, existing);
}

export async function pausePublishedVersions(
  store: ContentStore,
  questionVersionIds: string[],
): Promise<PauseResult> {
  const existing = await store.getVersions(uniqueTrimmedIds(questionVersionIds));
  const plan = planPause(questionVersionIds, existing);
  if (plan.ok) {
    await store.upsertVersions(plan.versions);
  }
  return { ok: plan.ok, reason: plan.reason, lines: plan.lines };
}

export async function resumePausedVersions(
  store: ContentStore,
  questionVersionIds: string[],
): Promise<ResumeResult> {
  const existing = await store.getVersions(uniqueTrimmedIds(questionVersionIds));
  const plan = planResume(questionVersionIds, existing);
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
