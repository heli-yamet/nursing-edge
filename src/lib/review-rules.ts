import { activeWindowExpiresAt } from "@/lib/clock";
import type { Confidence, ReviewStage, SixState } from "@/lib/learner-types";

export const REPAIR_DELAY_MS = 24 * 60 * 60 * 1000;
export const CONFIRMATION_DELAY_MS = 72 * 60 * 60 * 1000;

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

export function isReviewItemDue(now: Date, dueAt: Date, expiresAt: Date): boolean {
  return dueAt.getTime() <= now.getTime() && now.getTime() < expiresAt.getTime();
}

export function canOpenReviewCycle(activeExists: boolean): boolean {
  return !activeExists;
}
