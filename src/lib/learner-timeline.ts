import type { Attempt, ReviewTransition, SessionType } from "@/lib/learner-types";
import {
  interviewStepLabel,
  reviewEffectLabel,
  SIX_STATE_LABELS,
  SESSION_TYPE_LABELS,
  supportSkipSummary,
} from "@/lib/learner-admin-present";

export type TimelineInterview = {
  delivery_id: string;
  kind: "PROMPT" | "METHOD_FEEDBACK";
  prompt_number: number | null;
  label: string;
  delivered_at: string;
};

export type TimelineAttemptEntry = {
  kind: "attempt";
  at: string;
  attempt_id: string;
  session_id: string;
  session_type: SessionType;
  position: number;
  question_id: string;
  question_version_id: string;
  question_label: string;
  correct: boolean;
  confidence: string;
  six_state_label: string;
  review_effect: string | null;
  cycle_id: string | null;
  interviews: TimelineInterview[];
};

export type TimelineSupportSkipEntry = {
  kind: "support_skip";
  at: string;
  session_id: string;
  position: number;
  question_id: string;
  question_version_id: string;
  question_label: string;
  cycle_id: string | null;
  summary: string;
};

export type TimelineEntry = TimelineAttemptEntry | TimelineSupportSkipEntry;

export function buildLearnerTimeline(input: {
  attempts: readonly Attempt[];
  transitionsByAttempt: ReadonlyMap<string, ReviewTransition[]>;
  questionLabels: ReadonlyMap<string, string>;
  sessionTypes: ReadonlyMap<string, SessionType>;
  cycleByAttempt: ReadonlyMap<string, string>;
  interviewsByAttemptKey: ReadonlyMap<string, TimelineInterview[]>;
  supportSkips: readonly Omit<TimelineSupportSkipEntry, "kind" | "summary">[];
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const attempt of input.attempts) {
    const transitions = input.transitionsByAttempt.get(attempt.attempt_id) ?? [];
    const reviewEffect =
      transitions.map(reviewEffectLabel).find((label) => label !== null) ?? null;
    const attemptKey = `${attempt.session_id}\u0000${attempt.position}`;
    entries.push({
      kind: "attempt",
      at: attempt.committed_at.toISOString(),
      attempt_id: attempt.attempt_id,
      session_id: attempt.session_id,
      session_type:
        input.sessionTypes.get(attempt.session_id) ?? ("PRACTICE" as const),
      position: attempt.position,
      question_id: attempt.question_id,
      question_version_id: attempt.question_version_id,
      question_label:
        input.questionLabels.get(attempt.question_version_id) ??
        attempt.question_version_id,
      correct: attempt.correct,
      confidence: attempt.confidence,
      six_state_label: SIX_STATE_LABELS[attempt.six_state],
      review_effect: reviewEffect,
      cycle_id: input.cycleByAttempt.get(attempt.attempt_id) ?? null,
      interviews: input.interviewsByAttemptKey.get(attemptKey) ?? [],
    });
  }

  for (const skip of input.supportSkips) {
    entries.push({
      kind: "support_skip",
      ...skip,
      summary: supportSkipSummary(),
    });
  }

  entries.sort((left, right) => {
    const byTime = left.at.localeCompare(right.at);
    if (byTime !== 0) {
      return byTime;
    }
    const leftKind = left.kind === "attempt" ? 0 : 1;
    const rightKind = right.kind === "attempt" ? 0 : 1;
    return leftKind - rightKind;
  });

  return entries;
}

export function sessionTypeLabel(type: SessionType): string {
  return SESSION_TYPE_LABELS[type];
}

export function mapInterviewDeliveries(
  rows: readonly {
    delivery_id: string;
    session_id: string;
    position: number;
    kind: "PROMPT" | "METHOD_FEEDBACK";
    prompt_number: number | null;
    delivered_at: Date;
  }[],
): Map<string, TimelineInterview[]> {
  const grouped = new Map<string, TimelineInterview[]>();
  for (const row of rows) {
    const key = `${row.session_id}\u0000${row.position}`;
    const list = grouped.get(key) ?? [];
    list.push({
      delivery_id: row.delivery_id,
      kind: row.kind,
      prompt_number: row.prompt_number,
      label: interviewStepLabel(row.kind, row.prompt_number),
      delivered_at: row.delivered_at.toISOString(),
    });
    grouped.set(key, list);
  }
  for (const list of grouped.values()) {
    list.sort((left, right) => left.delivered_at.localeCompare(right.delivered_at));
  }
  return grouped;
}
