import { topicIdForVersion, type TopicBindingLookup } from "@/lib/learner-progress";
import { LEARNER_TOPICS, type LearnerTopicId } from "@/lib/learner-topics";
import type {
  Attempt,
  Confidence,
  QuestionFormat,
  ReviewTransition,
  SessionType,
  SixState,
} from "@/lib/learner-types";
import { REVIEW_CYCLE_REDIRECTED } from "@/lib/review-rules";
import {
  countResults,
  formatPercent,
  type ResultCounts,
} from "@/lib/session-results";

export const EVIDENCE_SESSION_TYPES = [
  "PRACTICE",
  "REVIEW",
  "CALIBRATION",
] as const;

export type EvidenceSessionType = (typeof EVIDENCE_SESSION_TYPES)[number];

export const REVIEW_OUTCOME_FILTERS = [
  "ALL",
  "NOT_APPLICABLE",
  "OPENED_REPAIR",
  "OPENED_CONFIRMATION",
  "ADVANCED",
  "COMPLETED",
  "REDIRECTED",
  "OTHER",
] as const;

export type ReviewOutcomeFilter = (typeof REVIEW_OUTCOME_FILTERS)[number];

export type ReviewEvidenceOutcome =
  | "NOT_APPLICABLE"
  | "OPENED_REPAIR"
  | "OPENED_CONFIRMATION"
  | "ADVANCED"
  | "COMPLETED"
  | "REDIRECTED"
  | "OTHER";

export type LearningEvidenceFilters = {
  from: Date | null;
  to: Date | null;
  topic_id: LearnerTopicId | null;
  format: QuestionFormat | null;
  confidence: Confidence | null;
  six_state: SixState | null;
  session_type: EvidenceSessionType | null;
  review_outcome: ReviewOutcomeFilter;
};

export type LearningEvidenceRow = {
  attempt_id: string;
  learner_id: string;
  committed_at: string;
  session_type: EvidenceSessionType;
  format: QuestionFormat;
  topic_id: LearnerTopicId | null;
  topic_name: string | null;
  correct: boolean;
  confidence: Confidence;
  six_state: SixState;
  review_outcome: ReviewEvidenceOutcome;
  role: "CLINICAL" | "PHYSIOLOGY";
};

export type LearningEvidenceSummary = {
  filters: LearningEvidenceFilters;
  matched_attempts: number;
  clinical: ResultCounts;
  physiology: ResultCounts;
  rows: LearningEvidenceRow[];
  topics: { topic_id: LearnerTopicId; name: string }[];
};

const CONFIDENCE_SET = new Set<Confidence>(["UNSURE", "SURE", "CONFIDENT"]);
const SIX_STATE_SET = new Set<SixState>([
  "CORRECT_UNSURE",
  "CORRECT_SURE",
  "CORRECT_CONFIDENT",
  "INCORRECT_UNSURE",
  "INCORRECT_SURE",
  "INCORRECT_CONFIDENT",
]);
const FORMAT_SET = new Set<QuestionFormat>(["MCQ", "SATA"]);

export function classifyReviewEvidenceOutcome(
  sessionType: SessionType,
  transitions: readonly ReviewTransition[],
): ReviewEvidenceOutcome {
  if (sessionType !== "REVIEW") {
    return "NOT_APPLICABLE";
  }
  for (const transition of transitions) {
    if (transition.reason === "commit" && transition.to_stage === "REPAIR") {
      return "OPENED_REPAIR";
    }
    if (transition.reason === "commit" && transition.to_stage === "CONFIRMATION") {
      return "OPENED_CONFIRMATION";
    }
    if (transition.reason === REVIEW_CYCLE_REDIRECTED) {
      return "REDIRECTED";
    }
    if (transition.reason === "advance") {
      if (!transition.from_stage) {
        continue;
      }
      if (!transition.to_stage) {
        return "COMPLETED";
      }
      return "ADVANCED";
    }
  }
  return "OTHER";
}

function reviewOutcomeMatches(
  filter: ReviewOutcomeFilter,
  outcome: ReviewEvidenceOutcome,
): boolean {
  if (filter === "ALL") {
    return true;
  }
  if (filter === "NOT_APPLICABLE") {
    return outcome === "NOT_APPLICABLE";
  }
  return filter === outcome;
}

function inDateRange(
  committedAt: Date,
  from: Date | null,
  to: Date | null,
): boolean {
  const at = committedAt.getTime();
  if (from !== null && at < from.getTime()) {
    return false;
  }
  if (to !== null && at > to.getTime()) {
    return false;
  }
  return true;
}

export type EnrichedAttempt = Pick<
  Attempt,
  | "attempt_id"
  | "learner_id"
  | "committed_at"
  | "correct"
  | "confidence"
  | "six_state"
  | "question_version_id"
> & {
  session_type: SessionType;
  format: QuestionFormat;
  topic_id: LearnerTopicId | null;
  review_outcome: ReviewEvidenceOutcome;
  role: "CLINICAL" | "PHYSIOLOGY";
};

export function filterAndSummarizeLearningEvidence(input: {
  attempts: readonly EnrichedAttempt[];
  filters: LearningEvidenceFilters;
  rowLimit?: number;
}): LearningEvidenceSummary {
  const limit = input.rowLimit ?? 200;
  const matched: EnrichedAttempt[] = [];
  for (const row of input.attempts) {
    if (!inDateRange(row.committed_at, input.filters.from, input.filters.to)) {
      continue;
    }
    if (
      input.filters.topic_id !== null &&
      row.topic_id !== input.filters.topic_id
    ) {
      continue;
    }
    if (input.filters.format !== null && row.format !== input.filters.format) {
      continue;
    }
    if (
      input.filters.confidence !== null &&
      row.confidence !== input.filters.confidence
    ) {
      continue;
    }
    if (
      input.filters.six_state !== null &&
      row.six_state !== input.filters.six_state
    ) {
      continue;
    }
    if (
      input.filters.session_type !== null &&
      row.session_type !== input.filters.session_type
    ) {
      continue;
    }
    if (
      !reviewOutcomeMatches(input.filters.review_outcome, row.review_outcome)
    ) {
      continue;
    }
    matched.push(row);
  }

  const clinicalAttempts = matched.filter((row) => row.role === "CLINICAL");
  const physiologyAttempts = matched.filter((row) => row.role === "PHYSIOLOGY");

  const rows = matched
    .slice()
    .sort(
      (left, right) =>
        right.committed_at.getTime() - left.committed_at.getTime(),
    )
    .slice(0, limit)
    .map(
      (row): LearningEvidenceRow => ({
        attempt_id: row.attempt_id,
        learner_id: row.learner_id,
        committed_at: row.committed_at.toISOString(),
        session_type: row.session_type as EvidenceSessionType,
        format: row.format,
        topic_id: row.topic_id,
        topic_name: row.topic_id
          ? (LEARNER_TOPICS.find((topic) => topic.topic_id === row.topic_id)
              ?.name ?? null)
          : null,
        correct: row.correct,
        confidence: row.confidence,
        six_state: row.six_state,
        review_outcome: row.review_outcome,
        role: row.role,
      }),
    );

  return {
    filters: input.filters,
    matched_attempts: matched.length,
    clinical: countResults(clinicalAttempts.length, clinicalAttempts),
    physiology: countResults(physiologyAttempts.length, physiologyAttempts),
    rows,
    topics: LEARNER_TOPICS.map((topic) => ({
      topic_id: topic.topic_id,
      name: topic.name,
    })),
  };
}

export function parseIsoDate(value: string | null): Date | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function parseLearningEvidenceFilters(
  params: URLSearchParams,
): { ok: true; filters: LearningEvidenceFilters } | { ok: false; reason: string } {
  const from = parseIsoDate(params.get("from"));
  const to = parseIsoDate(params.get("to"));
  if (params.get("from") && from === null) {
    return { ok: false, reason: "from must be a valid ISO date." };
  }
  if (params.get("to") && to === null) {
    return { ok: false, reason: "to must be a valid ISO date." };
  }

  const topicRaw = params.get("topic_id")?.trim() ?? "";
  let topic_id: LearnerTopicId | null = null;
  if (topicRaw !== "") {
    const known = LEARNER_TOPICS.some((topic) => topic.topic_id === topicRaw);
    if (!known) {
      return { ok: false, reason: "topic_id is not a learner topic." };
    }
    topic_id = topicRaw as LearnerTopicId;
  }

  const formatRaw = params.get("format")?.trim().toUpperCase() ?? "";
  let format: QuestionFormat | null = null;
  if (formatRaw !== "") {
    if (!FORMAT_SET.has(formatRaw as QuestionFormat)) {
      return { ok: false, reason: "format must be MCQ or SATA." };
    }
    format = formatRaw as QuestionFormat;
  }

  const confidenceRaw = params.get("confidence")?.trim().toUpperCase() ?? "";
  let confidence: Confidence | null = null;
  if (confidenceRaw !== "") {
    if (!CONFIDENCE_SET.has(confidenceRaw as Confidence)) {
      return { ok: false, reason: "confidence must be UNSURE, SURE, or CONFIDENT." };
    }
    confidence = confidenceRaw as Confidence;
  }

  const sixRaw = params.get("six_state")?.trim().toUpperCase() ?? "";
  let six_state: SixState | null = null;
  if (sixRaw !== "") {
    if (!SIX_STATE_SET.has(sixRaw as SixState)) {
      return { ok: false, reason: "six_state is not valid." };
    }
    six_state = sixRaw as SixState;
  }

  const sessionRaw = params.get("session_type")?.trim().toUpperCase() ?? "";
  let session_type: EvidenceSessionType | null = null;
  if (sessionRaw !== "") {
    if (
      !EVIDENCE_SESSION_TYPES.includes(sessionRaw as EvidenceSessionType)
    ) {
      return {
        ok: false,
        reason: "session_type must be PRACTICE, REVIEW, or CALIBRATION.",
      };
    }
    session_type = sessionRaw as EvidenceSessionType;
  }

  const reviewRaw = params.get("review_outcome")?.trim().toUpperCase() ?? "ALL";
  if (
    !REVIEW_OUTCOME_FILTERS.includes(reviewRaw as ReviewOutcomeFilter)
  ) {
    return { ok: false, reason: "review_outcome is not valid." };
  }

  return {
    ok: true,
    filters: {
      from,
      to,
      topic_id,
      format,
      confidence,
      six_state,
      session_type,
      review_outcome: reviewRaw as ReviewOutcomeFilter,
    },
  };
}

export function accuracyLabel(counts: ResultCounts): string {
  if (counts.answered <= 0) {
    return "—";
  }
  const pct = formatPercent(counts.accuracy);
  return `${counts.correct}/${counts.answered}${pct ? ` (${pct})` : ""}`;
}
