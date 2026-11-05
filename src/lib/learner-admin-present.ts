import type {
  Confidence,
  ReviewAssignmentKind,
  ReviewCycleState,
  ReviewDeferredOwner,
  ReviewStage,
  ReviewTransition,
  SessionType,
  SixState,
} from "@/lib/learner-types";
import { REVIEW_CYCLE_REDIRECTED, SUPPORT_SKIP_LABEL } from "@/lib/review-rules";

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  UNSURE: "Unsure",
  SURE: "Sure",
  CONFIDENT: "Confident",
};

export const SIX_STATE_LABELS: Record<SixState, string> = {
  CORRECT_UNSURE: "Correct and Unsure",
  CORRECT_SURE: "Correct and Sure",
  CORRECT_CONFIDENT: "Correct and Confident",
  INCORRECT_UNSURE: "Incorrect and Unsure",
  INCORRECT_SURE: "Incorrect and Sure",
  INCORRECT_CONFIDENT: "Incorrect and Confident",
};

export const STAGE_LABELS: Record<ReviewStage, string> = {
  REPAIR: "Repair",
  CONFIRMATION: "Confirmation",
};

export const CYCLE_STATE_LABELS: Record<ReviewCycleState, string> = {
  ACTIVE: "Active",
  COMPLETE: "Complete",
  EXPIRED: "Expired",
  PAUSED: "Paused",
  CLOSED: "Closed",
};

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  PRACTICE: "Practice",
  REVIEW: "Review",
  CALIBRATION: "Calibration",
};

export const DEFERRED_REASON_LABELS: Record<
  ReviewDeferredOwner["reason"],
  string
> = {
  assignment_cap: "Not selected: session assignment cap",
  no_publishable_version: "Not selected: no publishable question version",
  deduped_question: "Not selected: another cycle for this question was kept",
};

export function reviewKindLabel(kind: ReviewAssignmentKind): string {
  if (kind === "alternate") {
    return "Approved alternate (sibling question)";
  }
  if (kind === "support") {
    return "Applied pathophysiology support";
  }
  return "Clinical owner question";
}

export function reviewEffectLabel(transition: ReviewTransition): string | null {
  if (transition.reason === "commit" && transition.to_stage) {
    return `Opened ${STAGE_LABELS[transition.to_stage]} Review`;
  }
  if (transition.reason === REVIEW_CYCLE_REDIRECTED) {
    if (transition.from_stage && !transition.to_stage) {
      return "Closed owner cycle as redirected after alternate attempt";
    }
    if (!transition.from_stage && transition.to_stage) {
      return `Opened sibling ${STAGE_LABELS[transition.to_stage]} Review`;
    }
    return "Review redirected to sibling question";
  }
  if (transition.reason === "advance") {
    if (!transition.from_stage) {
      return null;
    }
    if (!transition.to_stage) {
      return "Completed Review cycle";
    }
    return `Advanced to ${STAGE_LABELS[transition.to_stage]}`;
  }
  return null;
}

export function supportSkipSummary(): string {
  return SUPPORT_SKIP_LABEL;
}

export function interviewStepLabel(kind: "PROMPT" | "METHOD_FEEDBACK", promptNumber: number | null): string {
  if (kind === "METHOD_FEEDBACK") {
    return "Interview method feedback delivered";
  }
  if (promptNumber === 1) {
    return "Interview primary prompt delivered";
  }
  if (promptNumber === 2) {
    return "Interview second prompt delivered";
  }
  return "Interview prompt delivered";
}

export function formatAccessSummary(input: {
  registered: boolean;
  active_entitlement: boolean;
  entitlement_sources: string[];
}): string {
  if (!input.registered) {
    return "No account yet";
  }
  if (input.active_entitlement) {
    const sources = input.entitlement_sources.join(", ");
    return sources ? `Active access (${sources})` : "Active access";
  }
  return "Registered without active access";
}

export function formatCalibrationSummary(state: string): string {
  switch (state) {
    case "NOT_CHOSEN":
      return "Not chosen";
    case "STARTED":
      return "In progress";
    case "COMPLETED":
      return "Completed";
    case "DECLINED":
      return "Declined";
    default:
      return state;
  }
}
