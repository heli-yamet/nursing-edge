import type {
  Attempt,
  Confidence,
  Session,
  SessionType,
  SixState,
} from "@/lib/learner-types";

export const CONFIDENCE_LEVELS: readonly Confidence[] = [
  "UNSURE",
  "SURE",
  "CONFIDENT",
];

export const SIX_STATES: readonly SixState[] = [
  "CORRECT_UNSURE",
  "CORRECT_SURE",
  "CORRECT_CONFIDENT",
  "INCORRECT_UNSURE",
  "INCORRECT_SURE",
  "INCORRECT_CONFIDENT",
];

export type ResultCounts = {
  assigned: number;
  answered: number;
  correct: number;
  incorrect: number;
  /** Correct divided by answered. Null when nothing was answered. */
  accuracy: number | null;
  confidence: Record<Confidence, number>;
  /** Null for a confidence level with no answers. */
  accuracy_by_confidence: Record<Confidence, number | null>;
  six_state: Record<SixState, number>;
};

export type SessionResults =
  | { type: "PRACTICE" | "CALIBRATION"; overall: ResultCounts }
  | { type: "REVIEW"; clinical: ResultCounts; physiology: ResultCounts };

export type ResultAttempt = Pick<
  Attempt,
  | "attempt_id"
  | "learner_id"
  | "session_id"
  | "position"
  | "correct"
  | "confidence"
  | "six_state"
  | "sequence"
  | "committed_at"
>;

export class ResultsReconciliationError extends Error {
  constructor(message: string) {
    super(`Results do not reconcile: ${message}`);
    this.name = "ResultsReconciliationError";
  }
}

/** The one accuracy formula. Results and Progress both use it. */
export function accuracyOf(correct: number, answered: number): number | null {
  if (answered <= 0) {
    return null;
  }
  return correct / answered;
}

export function formatPercent(value: number | null): string | null {
  return value === null ? null : `${Math.round(value * 100)}%`;
}

function zeroBy<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Throws unless every breakdown adds up to the number answered. */
export function assertReconciled(counts: ResultCounts): void {
  const { answered } = counts;
  if (counts.correct + counts.incorrect !== answered) {
    throw new ResultsReconciliationError(
      "correct plus incorrect differs from answered",
    );
  }
  if (sum(CONFIDENCE_LEVELS.map((level) => counts.confidence[level])) !== answered) {
    throw new ResultsReconciliationError(
      "confidence counts differ from answered",
    );
  }
  if (sum(SIX_STATES.map((state) => counts.six_state[state])) !== answered) {
    throw new ResultsReconciliationError(
      "six-state counts differ from answered",
    );
  }
  const sixStateCorrect =
    counts.six_state.CORRECT_UNSURE +
    counts.six_state.CORRECT_SURE +
    counts.six_state.CORRECT_CONFIDENT;
  if (sixStateCorrect !== counts.correct) {
    throw new ResultsReconciliationError(
      "six-state correct counts differ from correct",
    );
  }
  for (const level of CONFIDENCE_LEVELS) {
    const pair =
      counts.six_state[`CORRECT_${level}`] +
      counts.six_state[`INCORRECT_${level}`];
    if (pair !== counts.confidence[level]) {
      throw new ResultsReconciliationError(
        `six-state counts differ from ${level} confidence`,
      );
    }
  }
}

export function countResults(
  assigned: number,
  attempts: readonly Pick<ResultAttempt, "correct" | "confidence" | "six_state">[],
): ResultCounts {
  const confidence = zeroBy(CONFIDENCE_LEVELS);
  const correctByConfidence = zeroBy(CONFIDENCE_LEVELS);
  const sixState = zeroBy(SIX_STATES);
  let correct = 0;
  for (const attempt of attempts) {
    if (!(attempt.confidence in confidence)) {
      throw new ResultsReconciliationError(
        `unknown confidence ${String(attempt.confidence)}`,
      );
    }
    if (!(attempt.six_state in sixState)) {
      throw new ResultsReconciliationError(
        `unknown six-state ${String(attempt.six_state)}`,
      );
    }
    confidence[attempt.confidence] += 1;
    sixState[attempt.six_state] += 1;
    if (attempt.correct) {
      correct += 1;
      correctByConfidence[attempt.confidence] += 1;
    }
  }
  const answered = attempts.length;
  const counts: ResultCounts = {
    assigned,
    answered,
    correct,
    incorrect: answered - correct,
    accuracy: accuracyOf(correct, answered),
    confidence,
    accuracy_by_confidence: {
      UNSURE: accuracyOf(correctByConfidence.UNSURE, confidence.UNSURE),
      SURE: accuracyOf(correctByConfidence.SURE, confidence.SURE),
      CONFIDENT: accuracyOf(correctByConfidence.CONFIDENT, confidence.CONFIDENT),
    },
    six_state: sixState,
  };
  assertReconciled(counts);
  return counts;
}

function byCommitOrder(left: ResultAttempt, right: ResultAttempt): number {
  return (
    left.committed_at.getTime() - right.committed_at.getTime() ||
    left.sequence - right.sequence ||
    (left.attempt_id < right.attempt_id
      ? -1
      : left.attempt_id > right.attempt_id
        ? 1
        : 0)
  );
}

/**
 * Results for one session from its own committed attempts: one attempt per
 * assigned position, first commit wins. Attempts from any other session or
 * learner are ignored, so later work never changes an ended session.
 */
export function sessionResults(
  session: Pick<Session, "session_id" | "learner_id" | "type" | "assigned_versions">,
  attempts: readonly ResultAttempt[],
): SessionResults {
  const assignedByPosition = new Map(
    session.assigned_versions.map((row) => [row.position, row]),
  );
  const answeredByPosition = new Map<number, ResultAttempt>();
  for (const attempt of [...attempts].sort(byCommitOrder)) {
    if (
      attempt.session_id !== session.session_id ||
      attempt.learner_id !== session.learner_id ||
      !assignedByPosition.has(attempt.position) ||
      answeredByPosition.has(attempt.position)
    ) {
      continue;
    }
    answeredByPosition.set(attempt.position, attempt);
  }

  if (session.type !== "REVIEW") {
    return {
      type: session.type,
      overall: countResults(assignedByPosition.size, [
        ...answeredByPosition.values(),
      ]),
    };
  }

  const isPhysiology = (position: number) =>
    assignedByPosition.get(position)?.review_kind === "support";
  const positions = [...assignedByPosition.keys()];
  const answered = [...answeredByPosition.values()];
  return {
    type: "REVIEW",
    clinical: countResults(
      positions.filter((position) => !isPhysiology(position)).length,
      answered.filter((attempt) => !isPhysiology(attempt.position)),
    ),
    physiology: countResults(
      positions.filter(isPhysiology).length,
      answered.filter((attempt) => isPhysiology(attempt.position)),
    ),
  };
}

export function totalAnswered(results: SessionResults): number {
  return results.type === "REVIEW"
    ? results.clinical.answered + results.physiology.answered
    : results.overall.answered;
}

export const RESULTS_TITLES: Record<SessionType, string> = {
  PRACTICE: "Practice Results",
  CALIBRATION: "Baseline Results",
  REVIEW: "Review Results",
};
