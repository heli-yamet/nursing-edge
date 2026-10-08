import { newPermanentId } from "@/lib/ids";
import {
  EMPTY_DEEPER,
  type DeeperExplanation,
  type FactualReveal,
  type RevealOption,
} from "@/lib/factual-reveal";
import type {
  Attempt,
  Confidence,
  QuestionFormat,
  ReviewCycle,
  ReviewTransition,
  Session,
  SessionDraft,
} from "@/lib/learner-types";
import {
  isAllowedConfidence,
  reviewEntryForCommit,
  sixStateOf,
} from "@/lib/review-rules";
import { stampRuleSetForCommit } from "@/lib/session-rules";

export type ScoredOption = {
  option_id: string;
  displayed_option: string;
  option_text: string;
};

export type ScoredVersion = {
  question_version_id: string;
  question_id: string;
  format: QuestionFormat;
  options: ScoredOption[];
  correct_option_ids: string[];
  learner_core_rationale: string;
  deeper?: DeeperExplanation;
};

export type CommitStore = {
  findActive(learnerId: string): Promise<Session | null>;
  findAttempt(sessionId: string, position: number): Promise<Attempt | null>;
  committedPositions(sessionId: string): Promise<number[]>;
  sequencesForQuestion(learnerId: string, questionId: string): Promise<number[]>;
  findActiveCycle(learnerId: string, questionId: string): Promise<ReviewCycle | null>;
  loadVersion(questionVersionId: string): Promise<ScoredVersion | null>;
  loadTopicName(questionId: string): Promise<string | null>;
  stampRuleSet(sessionId: string, ruleSetVersion: string): Promise<void>;
  insertAttempt(attempt: Attempt): Promise<"inserted" | "duplicate">;
  insertReviewEntry(
    cycle: ReviewCycle,
    transition: ReviewTransition,
  ): Promise<"inserted" | "already_active">;
  holdPosition(sessionId: string, position: number): Promise<void>;
  releaseHold(sessionId: string): Promise<void>;
  writeDraft(sessionId: string, draft: SessionDraft): Promise<void>;
};

export type CommitAnswerResult =
  | {
      result: "committed" | "replay";
      attempt: Attempt;
      reveal: FactualReveal;
      isLast: boolean;
    }
  | { result: "no_session" }
  | { result: "not_playable" }
  | { result: "invalid_request" }
  | { result: "version_mismatch" }
  | { result: "unavailable" };

export type CommittedReadResult =
  | { result: "reveal"; reveal: FactualReveal; isLast: boolean }
  | { result: "no_session" }
  | { result: "not_committed" }
  | { result: "invalid_request" }
  | { result: "unavailable" };

const CONFIDENCE_WORD: Record<Confidence, FactualReveal["confidence"]> = {
  UNSURE: "Unsure",
  SURE: "Sure",
  CONFIDENT: "Confident",
};

function isPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const rightIds = new Set(right);
  if (new Set(left).size !== rightIds.size) {
    return false;
  }
  return left.every((id) => rightIds.has(id));
}

function scoreAnswer(
  version: ScoredVersion,
  selectedOptionIds: readonly string[],
): { ok: true; correct: boolean } | { ok: false } {
  if (new Set(selectedOptionIds).size !== selectedOptionIds.length) {
    return { ok: false };
  }
  const optionIds = new Set(version.options.map((option) => option.option_id));
  if (!selectedOptionIds.every((id) => optionIds.has(id))) {
    return { ok: false };
  }
  if (version.format === "MCQ") {
    if (selectedOptionIds.length !== 1) {
      return { ok: false };
    }
    return {
      ok: true,
      correct: version.correct_option_ids.includes(selectedOptionIds[0]),
    };
  }
  if (version.format === "SATA") {
    if (selectedOptionIds.length < 1) {
      return { ok: false };
    }
    return {
      ok: true,
      correct: sameSet(selectedOptionIds, version.correct_option_ids),
    };
  }
  return { ok: false };
}

function optionsInOrder(
  version: ScoredVersion,
  ids: readonly string[],
): RevealOption[] {
  const wanted = new Set(ids);
  return version.options
    .filter((option) => wanted.has(option.option_id))
    .map((option) => ({
      option_id: option.option_id,
      displayed_option: option.displayed_option,
      option_text: option.option_text,
    }));
}

export function buildFactualReveal(
  attempt: Attempt,
  version: ScoredVersion,
  topic: string,
): FactualReveal {
  return {
    outcome: attempt.correct ? "Correct" : "Incorrect",
    selection: optionsInOrder(version, attempt.selected_option_ids),
    correct_options: optionsInOrder(version, version.correct_option_ids),
    confidence: CONFIDENCE_WORD[attempt.confidence],
    topic,
    learner_core_rationale: version.learner_core_rationale,
    deeper: version.deeper ?? EMPTY_DEEPER,
  };
}

function playable(session: Session): boolean {
  return session.type === "PRACTICE" || session.type === "CALIBRATION";
}

async function sessionIsComplete(
  store: CommitStore,
  session: Session,
): Promise<boolean> {
  const done = new Set(await store.committedPositions(session.session_id));
  return session.assigned_versions.every((item) => done.has(item.position));
}

async function finishStored(
  store: CommitStore,
  session: Session,
  attempt: Attempt,
  result: "committed" | "replay",
): Promise<CommitAnswerResult> {
  const version = await store.loadVersion(attempt.question_version_id);
  const topic = await store.loadTopicName(attempt.question_id);
  if (!version || !topic) {
    return { result: "unavailable" };
  }
  return {
    result,
    attempt,
    reveal: buildFactualReveal(attempt, version, topic),
    isLast: await sessionIsComplete(store, session),
  };
}

export async function commitSessionAnswer(input: {
  learnerId: string;
  position: unknown;
  questionVersionId: unknown;
  selectedOptionIds: unknown;
  confidence: unknown;
  store: CommitStore;
  now?: Date;
  newId?: () => string;
}): Promise<CommitAnswerResult> {
  if (!isPosition(input.position)) {
    return { result: "invalid_request" };
  }
  const position = input.position;

  const session = await input.store.findActive(input.learnerId);
  if (!session) {
    return { result: "no_session" };
  }
  if (!playable(session)) {
    return { result: "not_playable" };
  }

  const assignment = session.assigned_versions.find(
    (item) => item.position === position,
  );
  if (!assignment) {
    return { result: "invalid_request" };
  }

  const existing = await input.store.findAttempt(session.session_id, position);
  if (existing) {
    await input.store.holdPosition(session.session_id, position);
    return finishStored(input.store, session, existing, "replay");
  }

  if (
    typeof input.questionVersionId !== "string" ||
    input.questionVersionId.length === 0 ||
    typeof input.confidence !== "string" ||
    !isAllowedConfidence(input.confidence) ||
    !isStringArray(input.selectedOptionIds)
  ) {
    return { result: "invalid_request" };
  }
  if (input.questionVersionId !== assignment.question_version_id) {
    return { result: "version_mismatch" };
  }

  const done = new Set(
    await input.store.committedPositions(session.session_id),
  );
  const open = [...session.assigned_versions]
    .sort((left, right) => left.position - right.position)
    .find((item) => !done.has(item.position));
  if (open?.position !== position) {
    return { result: "invalid_request" };
  }

  const version = await input.store.loadVersion(assignment.question_version_id);
  if (
    !version ||
    version.question_id !== assignment.question_id ||
    (version.format !== "MCQ" && version.format !== "SATA")
  ) {
    return { result: "unavailable" };
  }
  const topic = await input.store.loadTopicName(assignment.question_id);
  if (!topic) {
    return { result: "unavailable" };
  }

  const scored = scoreAnswer(version, input.selectedOptionIds);
  if (!scored.ok) {
    return { result: "invalid_request" };
  }

  const stamped = stampRuleSetForCommit(session);
  if (session.rule_set_version !== stamped.version) {
    await input.store.stampRuleSet(session.session_id, stamped.version);
  }

  const priorSequences = await input.store.sequencesForQuestion(
    input.learnerId,
    assignment.question_id,
  );
  const sequence =
    priorSequences.reduce((max, value) => Math.max(max, value), 0) + 1;
  const newId = input.newId ?? newPermanentId;
  const committedAt = input.now ?? new Date();
  const attempt: Attempt = {
    attempt_id: newId(),
    learner_id: input.learnerId,
    session_id: session.session_id,
    position,
    question_id: assignment.question_id,
    question_version_id: assignment.question_version_id,
    selected_option_ids: [...input.selectedOptionIds],
    confidence: input.confidence,
    correct: scored.correct,
    six_state: sixStateOf(scored.correct, input.confidence),
    sequence,
    committed_at: committedAt,
    rule_set_version: stamped.version,
  };

  if ((await input.store.insertAttempt(attempt)) === "duplicate") {
    const stored = await input.store.findAttempt(session.session_id, position);
    if (!stored) {
      throw new Error("committed position could not be reread");
    }
    await input.store.holdPosition(session.session_id, position);
    return finishStored(input.store, session, stored, "replay");
  }

  const entry = reviewEntryForCommit(
    attempt.correct,
    attempt.confidence,
    attempt.committed_at,
  );
  if (entry && !(await input.store.findActiveCycle(input.learnerId, assignment.question_id))) {
    const cycle: ReviewCycle = {
      cycle_id: newId(),
      learner_id: input.learnerId,
      question_id: assignment.question_id,
      stage: entry.stage,
      state: "ACTIVE",
      due_at: entry.due_at,
      active_window_expires_at: entry.active_window_expires_at,
      paused_duration_ms: 0,
      triggering_attempt_id: attempt.attempt_id,
      triggering_six_state: attempt.six_state,
      closure_reason: null,
      rule_set_version: attempt.rule_set_version,
    };
    await input.store.insertReviewEntry(cycle, {
      transition_id: newId(),
      cycle_id: cycle.cycle_id,
      attempt_id: attempt.attempt_id,
      from_stage: null,
      to_stage: entry.stage,
      occurred_at: attempt.committed_at,
      reason: "commit",
    });
  }

  await input.store.holdPosition(session.session_id, position);
  return finishStored(input.store, session, attempt, "committed");
}

export async function readCommittedPosition(input: {
  learnerId: string;
  position: unknown;
  store: CommitStore;
}): Promise<CommittedReadResult> {
  if (!isPosition(input.position)) {
    return { result: "invalid_request" };
  }
  const session = await input.store.findActive(input.learnerId);
  if (!session) {
    return { result: "no_session" };
  }
  if (!playable(session)) {
    return { result: "not_committed" };
  }
  const attempt = await input.store.findAttempt(
    session.session_id,
    input.position,
  );
  if (!attempt) {
    return { result: "not_committed" };
  }
  const stored = await finishStored(input.store, session, attempt, "replay");
  if (stored.result !== "replay") {
    return { result: "unavailable" };
  }
  return {
    result: "reveal",
    reveal: stored.reveal,
    isLast: stored.isLast,
  };
}

export type MemoryCommitStore = CommitStore & {
  sessions: Session[];
  attempts: Attempt[];
  cycles: ReviewCycle[];
  transitions: ReviewTransition[];
};

export function createMemoryCommitStore(input: {
  session: Session | null;
  versions: ScoredVersion[];
  topics: Record<string, string>;
}): MemoryCommitStore {
  const sessions: Session[] = input.session ? [structuredClone(input.session)] : [];
  const attempts: Attempt[] = [];
  const cycles: ReviewCycle[] = [];
  const transitions: ReviewTransition[] = [];
  const versions = new Map(
    input.versions.map((version) => [version.question_version_id, version]),
  );

  return {
    sessions,
    attempts,
    cycles,
    transitions,
    async findActive(learnerId) {
      const found = sessions.find(
        (session) =>
          session.learner_id === learnerId && session.state === "ACTIVE",
      );
      return found ? structuredClone(found) : null;
    },
    async findAttempt(sessionId, position) {
      const found = attempts.find(
        (attempt) =>
          attempt.session_id === sessionId && attempt.position === position,
      );
      return found ? structuredClone(found) : null;
    },
    async committedPositions(sessionId) {
      return attempts
        .filter((attempt) => attempt.session_id === sessionId)
        .map((attempt) => attempt.position);
    },
    async sequencesForQuestion(learnerId, questionId) {
      return attempts
        .filter(
          (attempt) =>
            attempt.learner_id === learnerId &&
            attempt.question_id === questionId,
        )
        .map((attempt) => attempt.sequence);
    },
    async findActiveCycle(learnerId, questionId) {
      return (
        cycles.find(
          (cycle) =>
            cycle.learner_id === learnerId &&
            cycle.question_id === questionId &&
            cycle.state === "ACTIVE",
        ) ?? null
      );
    },
    async loadVersion(questionVersionId) {
      const version = versions.get(questionVersionId);
      return version ? structuredClone(version) : null;
    },
    async loadTopicName(questionId) {
      return input.topics[questionId] ?? null;
    },
    async stampRuleSet(sessionId, ruleSetVersion) {
      const session = sessions.find((item) => item.session_id === sessionId);
      if (session) {
        session.rule_set_version = ruleSetVersion;
      }
    },
    async insertAttempt(attempt) {
      if (
        attempts.some(
          (row) =>
            row.session_id === attempt.session_id &&
            row.position === attempt.position,
        )
      ) {
        return "duplicate";
      }
      attempts.push(structuredClone(attempt));
      return "inserted";
    },
    async insertReviewEntry(cycle, transition) {
      if (
        cycles.some(
          (row) =>
            row.learner_id === cycle.learner_id &&
            row.question_id === cycle.question_id &&
            row.state === "ACTIVE",
        )
      ) {
        return "already_active";
      }
      cycles.push(structuredClone(cycle));
      transitions.push(structuredClone(transition));
      return "inserted";
    },
    async holdPosition(sessionId, position) {
      const session = sessions.find((item) => item.session_id === sessionId);
      if (!session) {
        return;
      }
      session.held_position = position;
      if (session.draft?.position === position) {
        session.draft = null;
      }
    },
    async releaseHold(sessionId) {
      const session = sessions.find((item) => item.session_id === sessionId);
      if (session) {
        session.held_position = null;
      }
    },
    async writeDraft(sessionId, draft) {
      const session = sessions.find((item) => item.session_id === sessionId);
      if (!session) {
        return;
      }
      session.draft = structuredClone(draft);
      session.held_position = null;
    },
  };
}
