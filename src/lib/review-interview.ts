import { newPermanentId } from "@/lib/ids";
import type { MemoryCommitStore } from "@/lib/commit-answer";
import type { Attempt, Session } from "@/lib/learner-types";
import { isRetiredRelationship } from "@/lib/review-follow";
import { finishedAssignmentPositions } from "@/lib/session-rules";

export const INTERVIEW_MAX_PROMPTS = 2;
export const INTERVIEW_DISPLAY_PHASE = "PRE_ANSWER_COMMITMENT";
export const INTERVIEW_FEEDBACK_MODE = "AUTHORED_METHOD_SCAFFOLD_NO_GRADING";

export type TeachingDecisionState = "approved" | "banned";

/** Release permission for one exact teaching revision. The workbook approval_json stays null. */
export type TeachingDecision = {
  teaching_id: string;
  teaching_revision: number;
  state: TeachingDecisionState;
  admin_id: string;
  acted_at: Date;
};

export type InterviewTeachingRow = {
  teaching_id: string;
  teaching_revision: number;
  permanent_item_id: string;
  question_version: string;
  primary_prompt: string;
  learner_commitment_prompt: string;
  precommit_feedback: string;
  feedback_mode: string;
  optional_second_prompt: string | null;
  max_interactions: number;
  display_phase: string;
  status: string;
};

/** Server-side Interview. Method feedback and a second prompt leave the server only after delivery is recorded. */
export type ReviewInterview = {
  teaching_id: string;
  teaching_revision: number;
  prompts: string[];
  commitment_prompt: string;
  method_feedback: string;
};

/** What the page may hold before any reasoning commitment. */
export type InterviewOpening = {
  teaching_id: string;
  teaching_revision: number;
  primary_prompt: string;
  commitment_prompt: string;
  prompt_count: number;
};

export type InterviewStep =
  | { kind: "PROMPT"; prompt_number: number }
  | { kind: "METHOD_FEEDBACK" };

export type InterviewDelivery = {
  delivery_id: string;
  learner_id: string;
  session_id: string;
  position: number;
  question_id: string;
  question_version_id: string;
  teaching_id: string;
  teaching_revision: number;
  kind: InterviewStep["kind"];
  /** Null for method feedback. */
  prompt_number: number | null;
  delivered_at: Date;
};

export type InterviewStore = {
  findActive(learnerId: string): Promise<Session | null>;
  findAttempt(sessionId: string, position: number): Promise<Attempt | null>;
  committedPositions(sessionId: string): Promise<number[]>;
  loadInterview(questionId: string, questionVersionId: string): Promise<ReviewInterview | null>;
  deliveredSteps(input: {
    sessionId: string;
    position: number;
    teachingId: string;
    teachingRevision: number;
  }): Promise<InterviewStep[]>;
  saveDelivery(delivery: InterviewDelivery): Promise<"inserted" | "duplicate">;
};

export type InterviewDeliveryResult =
  | { result: "recorded"; text: string }
  | { result: "no_session" }
  | { result: "not_playable" }
  | { result: "invalid_request" }
  | { result: "version_mismatch" }
  | { result: "unavailable" };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function authoredSecondPrompt(value: string | null): string {
  const prompt = text(value);
  return prompt === "" || prompt.toLowerCase() === "none" ? "" : prompt;
}

export function teachingDecisionState(
  decisions: readonly { teaching_id: string; teaching_revision: number; state: string }[],
  teachingId: string,
  teachingRevision: number,
): TeachingDecisionState | "unapproved" {
  const found = decisions.find(
    (decision) =>
      decision.teaching_id === teachingId &&
      decision.teaching_revision === teachingRevision,
  );
  if (found?.state === "approved" || found?.state === "banned") {
    return found.state;
  }
  return "unapproved";
}

/**
 * Only the current revision for the exact served version can be used, and only
 * once that revision has its own approved decision.
 */
export function selectReviewInterview(input: {
  questionId: string;
  questionVersionId: string;
  rows: readonly InterviewTeachingRow[];
  decisions: readonly { teaching_id: string; teaching_revision: number; state: string }[];
}): ReviewInterview | null {
  const matches = input.rows.filter(
    (row) =>
      row.question_version === input.questionVersionId &&
      typeof row.teaching_revision === "number",
  );
  if (matches.length === 0) {
    return null;
  }
  if (new Set(matches.map((row) => row.teaching_id)).size !== 1) {
    return null;
  }
  const top = Math.max(...matches.map((row) => row.teaching_revision));
  const current = matches.filter((row) => row.teaching_revision === top);
  if (current.length !== 1) {
    return null;
  }
  const row = current[0];

  if (
    row.permanent_item_id !== input.questionId ||
    isRetiredRelationship(text(row.status)) ||
    row.display_phase !== INTERVIEW_DISPLAY_PHASE ||
    row.feedback_mode !== INTERVIEW_FEEDBACK_MODE ||
    teachingDecisionState(input.decisions, row.teaching_id, row.teaching_revision) !==
      "approved"
  ) {
    return null;
  }

  const primary = text(row.primary_prompt);
  const feedback = text(row.precommit_feedback);
  if (primary === "" || feedback === "") {
    return null;
  }

  const prompts = [primary];
  const second = authoredSecondPrompt(row.optional_second_prompt);
  const allowed = Number.isInteger(row.max_interactions) ? row.max_interactions : 1;
  if (second && allowed >= INTERVIEW_MAX_PROMPTS) {
    prompts.push(second);
  }

  return {
    teaching_id: row.teaching_id,
    teaching_revision: row.teaching_revision,
    prompts: prompts.slice(0, INTERVIEW_MAX_PROMPTS),
    commitment_prompt: text(row.learner_commitment_prompt),
    method_feedback: feedback,
  };
}

export function interviewOpening(interview: ReviewInterview): InterviewOpening {
  return {
    teaching_id: interview.teaching_id,
    teaching_revision: interview.teaching_revision,
    primary_prompt: interview.prompts[0] ?? "",
    commitment_prompt: interview.commitment_prompt,
    prompt_count: interview.prompts.length,
  };
}

function isPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function readStep(kind: unknown, promptNumber: unknown): InterviewStep | null {
  if (kind === "METHOD_FEEDBACK") {
    return { kind };
  }
  if (
    kind === "PROMPT" &&
    typeof promptNumber === "number" &&
    Number.isInteger(promptNumber) &&
    promptNumber >= 1 &&
    promptNumber <= INTERVIEW_MAX_PROMPTS
  ) {
    return { kind, prompt_number: promptNumber };
  }
  return null;
}

function sameStep(left: InterviewStep, right: InterviewStep): boolean {
  if (left.kind === "METHOD_FEEDBACK" || right.kind === "METHOD_FEEDBACK") {
    return left.kind === right.kind;
  }
  return left.prompt_number === right.prompt_number;
}

/** The step that has to be delivered before this one. */
function requiredBefore(step: InterviewStep): InterviewStep | null {
  if (step.kind === "METHOD_FEEDBACK") {
    return { kind: "PROMPT", prompt_number: 1 };
  }
  return step.prompt_number === 1 ? null : { kind: "METHOD_FEEDBACK" };
}

/**
 * Records one delivered Interview step for the open, uncommitted Review question.
 * Writes only the delivery row: no attempt, no exposure, no cycle change.
 */
export async function recordInterviewDelivery(input: {
  learnerId: string;
  position: unknown;
  questionVersionId: unknown;
  teachingId: unknown;
  teachingRevision: unknown;
  kind: unknown;
  promptNumber: unknown;
  store: InterviewStore;
  now?: Date;
  newId?: () => string;
}): Promise<InterviewDeliveryResult> {
  const step = readStep(input.kind, input.promptNumber);
  if (
    !step ||
    !isPosition(input.position) ||
    typeof input.questionVersionId !== "string" ||
    input.questionVersionId.length === 0 ||
    typeof input.teachingId !== "string" ||
    input.teachingId.length === 0 ||
    typeof input.teachingRevision !== "number" ||
    !Number.isInteger(input.teachingRevision)
  ) {
    return { result: "invalid_request" };
  }
  const position = input.position;

  const session = await input.store.findActive(input.learnerId);
  if (!session) {
    return { result: "no_session" };
  }
  if (session.type !== "REVIEW") {
    return { result: "not_playable" };
  }
  const assignment = session.assigned_versions.find((item) => item.position === position);
  if (!assignment) {
    return { result: "invalid_request" };
  }
  if (input.questionVersionId !== assignment.question_version_id) {
    return { result: "version_mismatch" };
  }
  if (typeof session.held_position === "number") {
    return { result: "invalid_request" };
  }
  if (await input.store.findAttempt(session.session_id, position)) {
    return { result: "invalid_request" };
  }
  const done = finishedAssignmentPositions(
    await input.store.committedPositions(session.session_id),
    session.skipped_positions,
  );
  const open = [...session.assigned_versions]
    .sort((left, right) => left.position - right.position)
    .find((item) => !done.has(item.position));
  if (open?.position !== position) {
    return { result: "invalid_request" };
  }

  const interview = await input.store.loadInterview(
    assignment.question_id,
    assignment.question_version_id,
  );
  if (!interview) {
    return { result: "unavailable" };
  }
  if (
    interview.teaching_id !== input.teachingId ||
    interview.teaching_revision !== input.teachingRevision
  ) {
    return { result: "version_mismatch" };
  }
  if (step.kind === "PROMPT" && step.prompt_number > interview.prompts.length) {
    return { result: "invalid_request" };
  }

  const delivered = await input.store.deliveredSteps({
    sessionId: session.session_id,
    position,
    teachingId: interview.teaching_id,
    teachingRevision: interview.teaching_revision,
  });
  const before = requiredBefore(step);
  if (before && !delivered.some((item) => sameStep(item, before))) {
    return { result: "invalid_request" };
  }

  if (!delivered.some((item) => sameStep(item, step))) {
    await input.store.saveDelivery({
      delivery_id: (input.newId ?? newPermanentId)(),
      learner_id: input.learnerId,
      session_id: session.session_id,
      position,
      question_id: assignment.question_id,
      question_version_id: assignment.question_version_id,
      teaching_id: interview.teaching_id,
      teaching_revision: interview.teaching_revision,
      kind: step.kind,
      prompt_number: step.kind === "PROMPT" ? step.prompt_number : null,
      delivered_at: input.now ?? new Date(),
    });
  }

  return {
    result: "recorded",
    text:
      step.kind === "METHOD_FEEDBACK"
        ? interview.method_feedback
        : interview.prompts[step.prompt_number - 1],
  };
}

export type MemoryInterviewStore = InterviewStore & {
  deliveries: InterviewDelivery[];
};

export function createMemoryInterviewStore(input: {
  commitStore: MemoryCommitStore;
  interviews: Record<string, ReviewInterview>;
}): MemoryInterviewStore {
  const deliveries: InterviewDelivery[] = [];
  return {
    deliveries,
    findActive: (learnerId) => input.commitStore.findActive(learnerId),
    findAttempt: (sessionId, position) => input.commitStore.findAttempt(sessionId, position),
    committedPositions: (sessionId) => input.commitStore.committedPositions(sessionId),
    async loadInterview(_questionId, questionVersionId) {
      const found = input.interviews[questionVersionId];
      return found ? structuredClone(found) : null;
    },
    async deliveredSteps({ sessionId, position, teachingId, teachingRevision }) {
      return deliveries
        .filter(
          (row) =>
            row.session_id === sessionId &&
            row.position === position &&
            row.teaching_id === teachingId &&
            row.teaching_revision === teachingRevision,
        )
        .map((row) =>
          row.kind === "PROMPT"
            ? { kind: "PROMPT" as const, prompt_number: row.prompt_number ?? 0 }
            : { kind: "METHOD_FEEDBACK" as const },
        );
    },
    async saveDelivery(delivery) {
      const exists = deliveries.some(
        (row) =>
          row.session_id === delivery.session_id &&
          row.position === delivery.position &&
          row.teaching_id === delivery.teaching_id &&
          row.teaching_revision === delivery.teaching_revision &&
          row.kind === delivery.kind &&
          row.prompt_number === delivery.prompt_number,
      );
      if (exists) {
        return "duplicate";
      }
      deliveries.push(structuredClone(delivery));
      return "inserted";
    },
  };
}
