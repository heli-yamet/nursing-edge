import { isValidAnswer } from "@/lib/answer-selection";
import {
  readCommittedPosition,
  type CommitStore,
} from "@/lib/commit-answer";
import type { FactualReveal } from "@/lib/factual-reveal";
import type { Confidence, SessionDraft } from "@/lib/learner-types";
import { isAllowedConfidence } from "@/lib/review-rules";

export type SaveDraftResult =
  | { result: "saved"; draft: SessionDraft }
  | { result: "committed"; reveal: FactualReveal; isLast: boolean }
  | { result: "no_session" }
  | { result: "not_playable" }
  | { result: "invalid_request" }
  | { result: "version_mismatch" }
  | { result: "unavailable" };

export type ReleaseHoldResult = { result: "released" } | { result: "no_session" };

function isPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readConfidence(value: unknown): Confidence | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && isAllowedConfidence(value)) {
    return value;
  }
  return undefined;
}

function selectionFits(
  format: string,
  optionIds: readonly string[],
  selectedIds: readonly string[],
): boolean {
  if (new Set(selectedIds).size !== selectedIds.length) {
    return false;
  }
  const allowed = new Set(optionIds);
  if (!selectedIds.every((id) => allowed.has(id))) {
    return false;
  }
  if (format === "MCQ") {
    return selectedIds.length <= 1;
  }
  return format === "SATA";
}

export async function saveSessionDraft(input: {
  learnerId: string;
  position: unknown;
  questionVersionId: unknown;
  selectedOptionIds: unknown;
  confidence: unknown;
  store: CommitStore;
}): Promise<SaveDraftResult> {
  if (!isPosition(input.position) || !isStringArray(input.selectedOptionIds)) {
    return { result: "invalid_request" };
  }
  const confidence = readConfidence(input.confidence);
  if (confidence === undefined) {
    return { result: "invalid_request" };
  }
  if (
    typeof input.questionVersionId !== "string" ||
    input.questionVersionId.length === 0
  ) {
    return { result: "invalid_request" };
  }

  const session = await input.store.findActive(input.learnerId);
  if (!session) {
    return { result: "no_session" };
  }
  if (session.type !== "PRACTICE" && session.type !== "CALIBRATION") {
    return { result: "not_playable" };
  }

  const assignment = session.assigned_versions.find(
    (item) => item.position === input.position,
  );
  if (!assignment) {
    return { result: "invalid_request" };
  }
  if (input.questionVersionId !== assignment.question_version_id) {
    return { result: "version_mismatch" };
  }

  const existing = await input.store.findAttempt(session.session_id, input.position);
  if (existing) {
    const stored = await readCommittedPosition({
      learnerId: input.learnerId,
      position: input.position,
      store: input.store,
    });
    if (stored.result !== "reveal") {
      return { result: "unavailable" };
    }
    return {
      result: "committed",
      reveal: stored.reveal,
      isLast: stored.isLast,
    };
  }

  const done = new Set(await input.store.committedPositions(session.session_id));
  const open = [...session.assigned_versions]
    .sort((left, right) => left.position - right.position)
    .find((item) => !done.has(item.position));
  if (open?.position !== input.position) {
    return { result: "invalid_request" };
  }

  const version = await input.store.loadVersion(assignment.question_version_id);
  if (!version || version.question_id !== assignment.question_id) {
    return { result: "unavailable" };
  }
  const optionIds = version.options.map((option) => option.option_id);
  if (!selectionFits(version.format, optionIds, input.selectedOptionIds)) {
    return { result: "invalid_request" };
  }

  const draft: SessionDraft = {
    position: input.position,
    question_version_id: assignment.question_version_id,
    selected_option_ids: [...input.selectedOptionIds],
    confidence: isValidAnswer(version.format, optionIds, input.selectedOptionIds)
      ? confidence
      : null,
  };
  await input.store.writeDraft(session.session_id, draft);
  return { result: "saved", draft };
}

export async function releaseSessionHold(input: {
  learnerId: string;
  store: CommitStore;
}): Promise<ReleaseHoldResult> {
  const session = await input.store.findActive(input.learnerId);
  if (!session) {
    return { result: "no_session" };
  }
  await input.store.releaseHold(session.session_id);
  return { result: "released" };
}
