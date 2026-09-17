import { newPermanentId } from "@/lib/ids";
import type { Attempt } from "@/lib/learner-types";

export function emailIsNotLearnerId(learnerId: string, email: string): boolean {
  return learnerId.trim().toLowerCase() !== email.trim().toLowerCase();
}

export function createLearnerId(): string {
  const learner_id = newPermanentId();
  if (learner_id.includes("@")) {
    throw new Error("learner_id must not be an email");
  }
  return learner_id;
}

export function assertAttemptUnchanged(
  committed: Attempt,
  next: Attempt,
): void {
  const keys: (keyof Attempt)[] = [
    "attempt_id",
    "learner_id",
    "session_id",
    "question_version_id",
    "selected_option_ids",
    "confidence",
    "correct",
    "six_state",
    "sequence",
    "committed_at",
    "rule_set_version",
  ];

  for (const key of keys) {
    const before = committed[key];
    const after = next[key];
    const same =
      before instanceof Date && after instanceof Date
        ? before.getTime() === after.getTime()
        : JSON.stringify(before) === JSON.stringify(after);
    if (!same) {
      throw new Error("attempts are immutable after commit");
    }
  }
}
