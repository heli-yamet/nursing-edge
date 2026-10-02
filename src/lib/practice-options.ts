import { LEARNER_TOPICS, type LearnerTopicId } from "@/lib/learner-topics";

export const PRACTICE_SIZES = [10, 25, 50] as const;
export type PracticeSize = (typeof PRACTICE_SIZES)[number];
export const DEFAULT_PRACTICE_SIZE: PracticeSize = 10;

export const ALL_TOPICS = "all-topics";
export type PracticeScope = typeof ALL_TOPICS | LearnerTopicId;

export type PracticeSupply = Record<PracticeScope, number>;

export const INSUFFICIENT_SUPPLY_MESSAGE =
  "This topic does not currently have enough approved questions for that session size.";

export const TOPIC_IDS: ReadonlySet<string> = new Set(
  LEARNER_TOPICS.map((topic) => topic.topic_id),
);

export function isPracticeScope(value: unknown): value is PracticeScope {
  return (
    typeof value === "string" && (value === ALL_TOPICS || TOPIC_IDS.has(value))
  );
}

export function isPracticeSize(value: unknown): value is PracticeSize {
  return PRACTICE_SIZES.some((size) => size === value);
}

export function practiceScopeLabel(scope: string): string {
  if (scope === ALL_TOPICS) {
    return "All Topics";
  }
  return LEARNER_TOPICS.find((topic) => topic.topic_id === scope)?.name ?? scope;
}

export function sizeIsAvailable(supply: number, size: PracticeSize): boolean {
  return supply >= size;
}
