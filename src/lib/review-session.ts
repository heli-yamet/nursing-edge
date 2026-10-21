import { createHash, randomBytes } from "node:crypto";
import { isSupportedInteraction } from "@/lib/eligibility-report";
import { newPermanentId } from "@/lib/ids";
import {
  CURRENT_RULE_SET_VERSION,
  type AssignedVersion,
  type ReviewStage,
  type Session,
  type SixState,
} from "@/lib/learner-types";
import type { SessionStore } from "@/lib/practice-session";
import { sessionQuestionsAreUnique } from "@/lib/session-rules";

export const REVIEW_ASSIGNMENT_CAP = 20;
export const PROTECTED_CONFIRMATIONS = 4;

export type OwnerVersionCandidate = {
  question_version_id: string;
  format: string;
  publication_status: string;
  active: boolean;
  valid: boolean;
  complete: boolean;
  stem: string;
};

export type DueOwnerSource = {
  cycle_id: string;
  question_id: string;
  stage: ReviewStage;
  due_at: Date;
  question_version_id: string | null;
  triggering_six_state?: SixState | null;
  last_owner_attempt_at?: Date | null;
  in_focus?: boolean;
};

export function selectOwnerVersionId(
  question: { status: string } | null,
  versions: readonly OwnerVersionCandidate[],
  barredVersionIds: ReadonlySet<string>,
): string | null {
  if (!question || question.status !== "ACTIVE") {
    return null;
  }
  let selected: string | null = null;
  for (const version of versions) {
    if (
      !version.stem ||
      version.publication_status !== "PUBLISHED" ||
      !version.active ||
      !version.valid ||
      !version.complete ||
      !isSupportedInteraction(version.format) ||
      barredVersionIds.has(version.question_version_id)
    ) {
      continue;
    }
    if (
      selected &&
      selected.localeCompare(version.question_version_id, undefined, {
        numeric: true,
      }) >= 0
    ) {
      continue;
    }
    selected = version.question_version_id;
  }
  return selected;
}

type ReadyOwner = DueOwnerSource & { question_version_id: string };

const REPAIR_TRIGGER_RANK: Partial<Record<SixState, number>> = {
  INCORRECT_CONFIDENT: 0,
  INCORRECT_SURE: 1,
  INCORRECT_UNSURE: 2,
  CORRECT_UNSURE: 3,
};

export function assignDueOwnerQuestions(
  sources: readonly DueOwnerSource[],
  seed: string,
): AssignedVersion[] {
  const ready = sources.filter(
    (source): source is ReadyOwner =>
      typeof source.question_version_id === "string" &&
      source.question_version_id.length > 0 &&
      (source.stage === "REPAIR" || source.stage === "CONFIRMATION"),
  );
  const selected = selectClinicalOwners(dedupeOwners(ready));
  return orderReviewBlocks(selected, seed).map((source, index) => ({
    position: index + 1,
    question_id: source.question_id,
    question_version_id: source.question_version_id,
  }));
}

function dedupeOwners(sources: readonly ReadyOwner[]): ReadyOwner[] {
  const ordered = [...sources].sort((left, right) => {
    const byDue = left.due_at.getTime() - right.due_at.getTime();
    if (byDue !== 0) {
      return byDue;
    }
    return compareUtf8(left.cycle_id, right.cycle_id);
  });
  const seen = new Set<string>();
  const unique: ReadyOwner[] = [];
  for (const source of ordered) {
    if (seen.has(source.question_id)) {
      continue;
    }
    seen.add(source.question_id);
    unique.push(source);
  }
  return unique;
}

function selectClinicalOwners(sources: readonly ReadyOwner[]): ReadyOwner[] {
  if (sources.length <= REVIEW_ASSIGNMENT_CAP) {
    return [...sources];
  }
  const confirmations = sources
    .filter((source) => source.stage === "CONFIRMATION")
    .sort(compareConfirmationPriority);
  const repairs = sources
    .filter((source) => source.stage === "REPAIR")
    .sort(compareRepairPriority);
  const reserved = Math.min(PROTECTED_CONFIRMATIONS, confirmations.length);
  const repairTake = Math.min(repairs.length, REVIEW_ASSIGNMENT_CAP - reserved);
  const confirmationTake = REVIEW_ASSIGNMENT_CAP - repairTake;
  return [
    ...confirmations.slice(0, confirmationTake),
    ...repairs.slice(0, repairTake),
  ];
}

function orderReviewBlocks(
  sources: readonly ReadyOwner[],
  seed: string,
): ReadyOwner[] {
  const confirmations = sources
    .filter((source) => source.stage === "CONFIRMATION")
    .sort((left, right) => compareBlockOrder(seed, left, right));
  const repairs = sources
    .filter((source) => source.stage === "REPAIR")
    .sort((left, right) => compareBlockOrder(seed, left, right));
  return [...confirmations, ...repairs];
}

function compareConfirmationPriority(left: ReadyOwner, right: ReadyOwner): number {
  return (
    compareFocus(left, right) ||
    compareDue(left, right) ||
    compareAttempt(left, right) ||
    compareUtf8(left.question_id, right.question_id) ||
    compareUtf8(left.cycle_id, right.cycle_id)
  );
}

function compareRepairPriority(left: ReadyOwner, right: ReadyOwner): number {
  return (
    compareFocus(left, right) ||
    compareRepairTrigger(left, right) ||
    compareDue(left, right) ||
    compareAttempt(left, right) ||
    compareUtf8(left.question_id, right.question_id) ||
    compareUtf8(left.cycle_id, right.cycle_id)
  );
}

function compareFocus(left: ReadyOwner, right: ReadyOwner): number {
  return Number(Boolean(right.in_focus)) - Number(Boolean(left.in_focus));
}

function compareDue(left: ReadyOwner, right: ReadyOwner): number {
  return left.due_at.getTime() - right.due_at.getTime();
}

function compareAttempt(left: ReadyOwner, right: ReadyOwner): number {
  const leftAt = left.last_owner_attempt_at?.getTime() ?? null;
  const rightAt = right.last_owner_attempt_at?.getTime() ?? null;
  if (leftAt === null && rightAt === null) {
    return 0;
  }
  if (leftAt === null) {
    return -1;
  }
  if (rightAt === null) {
    return 1;
  }
  return leftAt - rightAt;
}

function compareRepairTrigger(left: ReadyOwner, right: ReadyOwner): number {
  return repairTriggerRank(left) - repairTriggerRank(right);
}

function repairTriggerRank(source: ReadyOwner): number {
  const rank = source.triggering_six_state
    ? REPAIR_TRIGGER_RANK[source.triggering_six_state]
    : undefined;
  return rank ?? 4;
}

function compareBlockOrder(seed: string, left: ReadyOwner, right: ReadyOwner): number {
  const byDigest = Buffer.compare(blockDigest(seed, left), blockDigest(seed, right));
  if (byDigest !== 0) {
    return byDigest;
  }
  return compareUtf8(left.cycle_id, right.cycle_id);
}

function blockDigest(seed: string, source: ReadyOwner): Buffer {
  const prefix = source.stage === "CONFIRMATION" ? "C:" : "R:";
  return createHash("sha256")
    .update(`${seed}\n${prefix}${source.cycle_id}`, "utf8")
    .digest();
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function newReviewSeed(): string {
  return randomBytes(32).toString("hex");
}

export type StartReviewResult =
  | { result: "created"; session: Session }
  | { result: "already_active"; session: Session }
  | { result: "other_session"; session: Session }
  | { result: "none_due" }
  | { result: "unavailable" };

export async function startReviewSession(input: {
  learnerId: string;
  store: SessionStore;
  loadDue: () => Promise<DueOwnerSource[]>;
  now?: Date;
  newId?: () => string;
  seed?: string;
}): Promise<StartReviewResult> {
  const existing = await input.store.findActive(input.learnerId);
  if (existing?.type === "REVIEW") {
    return { result: "already_active", session: existing };
  }
  if (existing) {
    return { result: "other_session", session: existing };
  }

  const due = await input.loadDue();
  const seed = input.seed ?? newReviewSeed();
  const assigned = assignDueOwnerQuestions(due, seed);
  if (assigned.length === 0) {
    return { result: due.length > 0 ? "unavailable" : "none_due" };
  }
  if (!sessionQuestionsAreUnique(assigned)) {
    throw new Error("review selection assigned the same question twice");
  }

  const session: Session = {
    session_id: (input.newId ?? newPermanentId)(),
    learner_id: input.learnerId,
    type: "REVIEW",
    scope: "due",
    size: assigned.length,
    state: "ACTIVE",
    assigned_versions: assigned,
    created_at: input.now ?? new Date(),
    rule_set_version: CURRENT_RULE_SET_VERSION,
    order_seed: seed,
  };

  if ((await input.store.insert(session)) === "inserted") {
    return { result: "created", session };
  }

  const winner = await input.store.findActive(input.learnerId);
  if (!winner) {
    throw new Error("active session conflict could not be resolved");
  }
  if (winner.type === "REVIEW") {
    return { result: "already_active", session: winner };
  }
  return { result: "other_session", session: winner };
}
