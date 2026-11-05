import {
  attempts,
  entitlements,
  learners,
  reviewCycles,
  sessions,
} from "@/lib/learner-collections";
import { reviewOutlook } from "@/lib/review-outlook";

export type AdminOverviewPayload = {
  generated_at: string;
  learners: {
    registered: number;
    with_active_access: number;
    active_recently: number;
  };
  recent_activity: {
    attempts_last_7_days: number;
    sessions_last_7_days: number;
  };
  review: {
    due_now: number;
    next_due_at: string | null;
    near_expiry: number;
    expired: number;
    active_cycles: number;
    paused_cycles: number;
  };
};

const RECENT_ACTIVITY_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_LEARNER_MS = 30 * 24 * 60 * 60 * 1000;

export async function loadAdminOverview(
  now: Date = new Date(),
): Promise<AdminOverviewPayload> {
  const since7 = new Date(now.getTime() - RECENT_ACTIVITY_MS);
  const since30 = new Date(now.getTime() - ACTIVE_LEARNER_MS);

  const [
    registered,
    withActiveAccess,
    attemptsLast7,
    sessionsLast7,
    activeLearnerIds,
    cycleRows,
  ] = await Promise.all([
    (await learners()).countDocuments({}),
    (await entitlements()).countDocuments({
      status: "ACTIVE",
      learner_id: { $ne: null },
    }),
    (await attempts()).countDocuments({ committed_at: { $gte: since7 } }),
    (await sessions()).countDocuments({ created_at: { $gte: since7 } }),
    (await attempts()).distinct("learner_id", {
      committed_at: { $gte: since30 },
    }),
    (await reviewCycles())
      .find(
        {},
        {
          projection: {
            _id: 0,
            state: 1,
            due_at: 1,
            active_window_expires_at: 1,
          },
        },
      )
      .toArray(),
  ]);

  const outlook = reviewOutlook(cycleRows, now);
  const active_cycles = cycleRows.filter((row) => row.state === "ACTIVE").length;
  const paused_cycles = cycleRows.filter((row) => row.state === "PAUSED").length;

  return {
    generated_at: now.toISOString(),
    learners: {
      registered,
      with_active_access: withActiveAccess,
      active_recently: activeLearnerIds.length,
    },
    recent_activity: {
      attempts_last_7_days: attemptsLast7,
      sessions_last_7_days: sessionsLast7,
    },
    review: {
      due_now: outlook.due_now,
      next_due_at: outlook.next_due_at?.toISOString() ?? null,
      near_expiry: outlook.near_expiry,
      expired: outlook.expired,
      active_cycles,
      paused_cycles,
    },
  };
}
