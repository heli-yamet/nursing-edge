export type Clock = {
  now(): Date;
};

export const systemClock: Clock = {
  now: () => new Date(),
};

export const REVIEW_ACTIVE_WINDOW_MS = 14 * 60 * 1000;

/** The last day of the 14-day review window. Follows the compressed window length. */
export const REVIEW_EXPIRY_NEAR_MS = REVIEW_ACTIVE_WINDOW_MS / 14;

export function createFakeClock(start: Date) {
  let current = new Date(start.getTime());

  return {
    now(): Date {
      return new Date(current.getTime());
    },
    advanceHours(hours: number): void {
      current = new Date(current.getTime() + hours * 3_600_000);
    },
    advanceMs(ms: number): void {
      current = new Date(current.getTime() + ms);
    },
  };
}

export function activeWindowExpiresAt(dueAt: Date): Date {
  return new Date(dueAt.getTime() + REVIEW_ACTIVE_WINDOW_MS);
}
