import type { AssignedVersion, SessionState, SessionType } from "@/lib/learner-types";

export function canStartQuestionSession(
  existing: { state: SessionState; type: SessionType }[],
): boolean {
  return !existing.some((session) => session.state === "ACTIVE");
}

export function sessionQuestionsAreUnique(
  assigned: AssignedVersion[],
): boolean {
  const ids = assigned.map((item) => item.question_id);
  return new Set(ids).size === ids.length;
}
