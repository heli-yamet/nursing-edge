import { REVIEW_EXPIRY_NEAR_MS } from "@/lib/clock";
import type { ReviewCycleState } from "@/lib/learner-types";
import { isDueReviewCycle } from "@/lib/review-rules";

export type ReviewOutlookCycle = {
  state: ReviewCycleState;
  due_at: Date;
  active_window_expires_at: Date;
};

export type ReviewOutlook = {
  due_now: number;
  next_due_at: Date | null;
  near_expiry: number;
  /** Cycles whose review window has ended. History, separate from answer counts. */
  expired: number;
};

export function reviewOutlook(
  cycles: readonly ReviewOutlookCycle[],
  now: Date,
): ReviewOutlook {
  let due_now = 0;
  let near_expiry = 0;
  let expired = 0;
  let next_due_at: Date | null = null;
  const at = now.getTime();

  for (const cycle of cycles) {
    if (cycle.state === "EXPIRED") {
      expired += 1;
      continue;
    }
    if (cycle.state !== "ACTIVE") {
      continue;
    }
    if (at >= cycle.active_window_expires_at.getTime()) {
      expired += 1;
      continue;
    }
    if (isDueReviewCycle(cycle, now)) {
      due_now += 1;
    } else if (
      cycle.due_at.getTime() > at &&
      (next_due_at === null || cycle.due_at.getTime() < next_due_at.getTime())
    ) {
      next_due_at = cycle.due_at;
    }
    const remaining = cycle.active_window_expires_at.getTime() - at;
    if (remaining <= REVIEW_EXPIRY_NEAR_MS) {
      near_expiry += 1;
    }
  }

  return { due_now, next_due_at, near_expiry, expired };
}

export function formatReviewDue(date: Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(date);
}
