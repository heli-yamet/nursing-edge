import { isSupportedInteraction } from "@/lib/eligibility-report";
import { newPermanentId } from "@/lib/ids";
import {
  CURRENT_RULE_SET_VERSION,
  type AssignedVersion,
  type Session,
} from "@/lib/learner-types";
import type { SessionStore } from "@/lib/practice-session";
import { sessionQuestionsAreUnique } from "@/lib/session-rules";

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
  due_at: Date;
  question_version_id: string | null;
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

export function assignDueOwnerQuestions(
  sources: readonly DueOwnerSource[],
): AssignedVersion[] {
  const ready = sources.filter(
    (
      source,
    ): source is DueOwnerSource & { question_version_id: string } =>
      typeof source.question_version_id === "string" &&
      source.question_version_id.length > 0,
  );
  const ordered = [...ready].sort((left, right) => {
    const byDue = left.due_at.getTime() - right.due_at.getTime();
    if (byDue !== 0) {
      return byDue;
    }
    if (left.cycle_id < right.cycle_id) {
      return -1;
    }
    if (left.cycle_id > right.cycle_id) {
      return 1;
    }
    return 0;
  });
  const seen = new Set<string>();
  const assigned: AssignedVersion[] = [];
  for (const source of ordered) {
    if (seen.has(source.question_id)) {
      continue;
    }
    seen.add(source.question_id);
    assigned.push({
      position: assigned.length + 1,
      question_id: source.question_id,
      question_version_id: source.question_version_id,
    });
  }
  return assigned;
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
}): Promise<StartReviewResult> {
  const existing = await input.store.findActive(input.learnerId);
  if (existing?.type === "REVIEW") {
    return { result: "already_active", session: existing };
  }
  if (existing) {
    return { result: "other_session", session: existing };
  }

  const due = await input.loadDue();
  const assigned = assignDueOwnerQuestions(due);
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
