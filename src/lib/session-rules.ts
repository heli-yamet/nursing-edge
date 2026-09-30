import type { AssignedVersion, SessionState, SessionType } from "@/lib/learner-types";

export type HomeActionId =
  | "continue-session"
  | "start-practice"
  | "review"
  | "progress";

export const HOME_ACTIONS: Record<
  HomeActionId,
  { href: string; label: string }
> = {
  "continue-session": { href: "/practice", label: "Continue Session" },
  "start-practice": { href: "/practice", label: "Start Practice" },
  review: { href: "/review", label: "Review" },
  progress: { href: "/progress", label: "Progress" },
};

export function sessionCountsAsActive(state: SessionState | null): boolean {
  return state === "ACTIVE";
}

export function homeActionOrder(input: {
  hasActiveSession: boolean;
  reviewDue: boolean;
}): HomeActionId[] {
  if (input.hasActiveSession) {
    return ["continue-session", "review", "progress"];
  }
  if (input.reviewDue) {
    return ["review", "start-practice", "progress"];
  }
  return ["start-practice", "review", "progress"];
}

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
