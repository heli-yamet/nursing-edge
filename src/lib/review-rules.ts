import { activeWindowExpiresAt } from "@/lib/clock";
import type {
  Confidence,
  ReviewCycleState,
  ReviewStage,
  SixState,
} from "@/lib/learner-types";

export const REPAIR_DELAY_MS = 24 * 1000;
export const CONFIRMATION_DELAY_MS = 72 * 1000;

export type ReviewEntry = {
  stage: ReviewStage;
  due_at: Date;
  active_window_expires_at: Date;
};

export function sixStateOf(correct: boolean, confidence: Confidence): SixState {
  return `${correct ? "CORRECT" : "INCORRECT"}_${confidence}` as SixState;
}

export function isAllowedConfidence(value: string): value is Confidence {
  return value === "UNSURE" || value === "SURE" || value === "CONFIDENT";
}

export function isSixState(value: unknown): value is SixState {
  return (
    value === "CORRECT_UNSURE" ||
    value === "CORRECT_SURE" ||
    value === "CORRECT_CONFIDENT" ||
    value === "INCORRECT_UNSURE" ||
    value === "INCORRECT_SURE" ||
    value === "INCORRECT_CONFIDENT"
  );
}

export function isReviewStage(value: unknown): value is ReviewStage {
  return value === "REPAIR" || value === "CONFIRMATION";
}

export function reviewSuccess(correct: boolean, confidence: Confidence): boolean {
  return correct && (confidence === "SURE" || confidence === "CONFIDENT");
}

export function reviewEntryForCommit(
  correct: boolean,
  confidence: Confidence,
  committedAt: Date,
): ReviewEntry | null {
  if (!isAllowedConfidence(confidence)) {
    throw new Error("confidence must be UNSURE, SURE, or CONFIDENT");
  }

  if (correct && confidence === "CONFIDENT") {
    return null;
  }

  const stage: ReviewStage =
    correct && confidence === "SURE" ? "CONFIRMATION" : "REPAIR";
  const delay =
    stage === "CONFIRMATION" ? CONFIRMATION_DELAY_MS : REPAIR_DELAY_MS;
  const due_at = new Date(committedAt.getTime() + delay);

  return {
    stage,
    due_at,
    active_window_expires_at: activeWindowExpiresAt(due_at),
  };
}

export type ReviewAdvance =
  | { kind: "complete" }
  | { kind: "continue"; stage: ReviewStage; due_at: Date; active_window_expires_at: Date };

export function advanceReviewStage(
  current: ReviewStage,
  correct: boolean,
  confidence: Confidence,
  committedAt: Date,
): ReviewAdvance {
  if (!isAllowedConfidence(confidence)) {
    throw new Error("confidence must be UNSURE, SURE, or CONFIDENT");
  }

  const success = reviewSuccess(correct, confidence);

  if (current === "CONFIRMATION" && success) {
    return { kind: "complete" };
  }

  if (current === "REPAIR" && success) {
    const due_at = new Date(committedAt.getTime() + CONFIRMATION_DELAY_MS);
    return {
      kind: "continue",
      stage: "CONFIRMATION",
      due_at,
      active_window_expires_at: activeWindowExpiresAt(due_at),
    };
  }

  const due_at = new Date(committedAt.getTime() + REPAIR_DELAY_MS);
  return {
    kind: "continue",
    stage: "REPAIR",
    due_at,
    active_window_expires_at: activeWindowExpiresAt(due_at),
  };
}

export const REVIEW_CYCLE_COMPLETED = "completed";

export function isReviewItemDue(now: Date, dueAt: Date, expiresAt: Date): boolean {
  return dueAt.getTime() <= now.getTime() && now.getTime() < expiresAt.getTime();
}

export function isDueReviewCycle(
  cycle: {
    state: ReviewCycleState;
    due_at: Date;
    active_window_expires_at: Date;
  },
  now: Date,
): boolean {
  return (
    cycle.state === "ACTIVE" &&
    isReviewItemDue(now, cycle.due_at, cycle.active_window_expires_at)
  );
}

export function canOpenReviewCycle(activeExists: boolean): boolean {
  return !activeExists;
}

export function cycleHoldsQuestion(state: ReviewCycleState): boolean {
  return state === "ACTIVE" || state === "PAUSED";
}

export function pauseReviewCycle<T extends ReviewCycleClock>(
  cycle: T,
  pausedAt: Date,
): T {
  if (cycle.state !== "ACTIVE") {
    return cycle;
  }
  return {
    ...cycle,
    state: "PAUSED",
    paused_at: pausedAt,
  };
}

export function resumeReviewCycle<T extends ReviewCycleClock>(
  cycle: T,
  resumedAt: Date,
): T {
  if (cycle.state !== "PAUSED") {
    return cycle;
  }
  const started = cycle.paused_at?.getTime() ?? resumedAt.getTime();
  const duration = Math.max(0, resumedAt.getTime() - started);
  return {
    ...cycle,
    state: "ACTIVE",
    paused_at: null,
    paused_duration_ms: cycle.paused_duration_ms + duration,
    active_window_expires_at: new Date(
      cycle.active_window_expires_at.getTime() + duration,
    ),
  };
}

export function reviewCycleAfterContentAvailability<T extends ReviewCycleClock>(
  cycle: T,
  servable: boolean,
  now: Date,
): T | null {
  if (cycle.state === "ACTIVE" && !servable) {
    return pauseReviewCycle(cycle, now);
  }
  if (cycle.state === "PAUSED" && servable) {
    return resumeReviewCycle(cycle, now);
  }
  return null;
}

export function pauseFieldsAfterAdvance(
  cycle: Pick<ReviewCycleClock, "state" | "paused_at" | "paused_duration_ms">,
  occurredAt: Date,
  kind: "complete" | "continue",
): {
  state: "ACTIVE" | "PAUSED" | "COMPLETE";
  paused_at: Date | null;
  paused_duration_ms: number;
} {
  const started =
    cycle.state === "PAUSED"
      ? (cycle.paused_at?.getTime() ?? occurredAt.getTime())
      : null;
  const duration =
    started === null ? 0 : Math.max(0, occurredAt.getTime() - started);
  const paused_duration_ms = cycle.paused_duration_ms + duration;
  if (kind === "continue" && cycle.state === "PAUSED") {
    return {
      state: "PAUSED",
      paused_at: occurredAt,
      paused_duration_ms,
    };
  }
  return {
    state: kind === "complete" ? "COMPLETE" : "ACTIVE",
    paused_at: null,
    paused_duration_ms,
  };
}

type ReviewCycleClock = {
  state: ReviewCycleState;
  due_at: Date;
  active_window_expires_at: Date;
  paused_duration_ms: number;
  paused_at?: Date | null;
  closure_reason?: string | null;
};
