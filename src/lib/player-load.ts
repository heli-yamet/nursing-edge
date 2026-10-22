import { isSupportedInteraction } from "@/lib/eligibility-report";
import { isValidAnswer } from "@/lib/answer-selection";
import {
  isPracticeBarredRole,
  practiceRoleForVersion,
} from "@/lib/practice-role";
import { attempts, questionVersions } from "@/lib/learner-collections";
import type { Confidence, SessionDraft, SessionType } from "@/lib/learner-types";
import { reviewAssignmentKind } from "@/lib/review-follow";
import {
  finishedAssignmentPositions,
  sessionIsPlayable,
  type PlayableSessionType,
} from "@/lib/session-rules";
import { readLearnerCommittedPosition } from "@/lib/mongo-commit-store";
import type { FactualReveal } from "@/lib/factual-reveal";
import {
  toPreCommitQuestion,
  type PreCommitQuestion,
} from "@/lib/player-question";
import { readActiveSession } from "@/lib/practice-setup";

export type PlayerDraft = {
  selected_option_ids: string[];
  confidence: Confidence | null;
};

export type PlayerLoad =
  | { result: "no_session" }
  | { result: "not_playable" }
  | { result: "unavailable" }
  | { result: "none_open"; size: number }
  | {
      result: "open";
      type: PlayableSessionType;
      size: number;
      position: number;
      questionVersionId: string;
      question: PreCommitQuestion;
      draft: PlayerDraft | null;
      supportSkip: boolean;
    }
  | {
      result: "feedback";
      type: PlayableSessionType;
      size: number;
      position: number;
      questionVersionId: string;
      question: PreCommitQuestion;
      reveal: FactualReveal;
      isLast: boolean;
    };

export function questionCanBeDisplayed(
  version: {
    stem?: string;
    options?: unknown;
    format: string;
  } | null,
  role: string | null | undefined,
  sessionType?: SessionType,
): boolean {
  const practiceGate = sessionType !== "REVIEW";
  return Boolean(
    version?.stem &&
      version.options &&
      isSupportedInteraction(version.format) &&
      !(practiceGate && isPracticeBarredRole(role)),
  );
}

const QUESTION_PROJECTION = {
  _id: 0,
  format: 1,
  stem: 1,
  "options.option_id": 1,
  "options.displayed_option": 1,
  "options.option_text": 1,
} as const;

export async function loadOpenPlayerQuestion(
  learnerId: string,
): Promise<PlayerLoad> {
  const session = await readActiveSession(learnerId);
  if (!session) {
    return { result: "no_session" };
  }
  if (!sessionIsPlayable(session.type)) {
    return { result: "not_playable" };
  }

  const assigned = [...session.assigned_versions].sort(
    (left, right) => left.position - right.position,
  );
  const size = assigned.length;
  const held = await heldFeedback(learnerId, session.held_position, session.type, size, assigned);
  if (held) {
    return held;
  }

  const committed = await (
    await attempts()
  )
    .find(
      { session_id: session.session_id },
      { projection: { _id: 0, position: 1 } },
    )
    .toArray();
  const done = finishedAssignmentPositions(
    committed.map((attempt) => attempt.position),
    session.skipped_positions,
  );
  const open = assigned.find((item) => !done.has(item.position));
  if (!open) {
    return { result: "none_open", size };
  }

  const version = await (
    await questionVersions()
  ).findOne(
    { question_version_id: open.question_version_id },
    { projection: QUESTION_PROJECTION },
  );
  const role = await practiceRoleForVersion(open.question_version_id);
  if (!version || !questionCanBeDisplayed(version, role, session.type)) {
    return { result: "unavailable" };
  }

  return {
    result: "open",
    type: session.type,
    size,
    position: open.position,
    questionVersionId: open.question_version_id,
    question: toPreCommitQuestion(version),
    draft: restoredDraft(session.draft, open.position, open.question_version_id, version),
    supportSkip:
      session.type === "REVIEW" && reviewAssignmentKind(open) === "support",
  };
}

function restoredDraft(
  draft: SessionDraft | null | undefined,
  position: number,
  questionVersionId: string,
  version: { format: string; options: { option_id: string }[] },
): PlayerDraft | null {
  if (
    !draft ||
    draft.position !== position ||
    draft.question_version_id !== questionVersionId
  ) {
    return null;
  }
  const optionIds = version.options.map((option) => option.option_id);
  const selected = draft.selected_option_ids.filter((id) => optionIds.includes(id));
  return {
    selected_option_ids: selected,
    confidence: isValidAnswer(version.format, optionIds, selected)
      ? draft.confidence
      : null,
  };
}

async function heldFeedback(
  learnerId: string,
  heldPosition: number | null | undefined,
  type: PlayableSessionType,
  size: number,
  assigned: { position: number; question_version_id: string }[],
): Promise<
  Extract<PlayerLoad, { result: "feedback" | "unavailable" }> | null
> {
  if (typeof heldPosition !== "number") {
    return null;
  }
  const assignment = assigned.find((item) => item.position === heldPosition);
  if (!assignment) {
    return null;
  }
  const held = await readLearnerCommittedPosition({
    learnerId,
    position: heldPosition,
  });
  if (held.result !== "reveal") {
    return null;
  }
  const version = await (
    await questionVersions()
  ).findOne(
    { question_version_id: assignment.question_version_id },
    { projection: QUESTION_PROJECTION },
  );
  const role = await practiceRoleForVersion(assignment.question_version_id);
  if (isPracticeBarredRole(role) && type !== "REVIEW") {
    return { result: "unavailable" };
  }
  if (
    !version?.stem ||
    !version.options ||
    !isSupportedInteraction(version.format)
  ) {
    return null;
  }
  return {
    result: "feedback",
    type,
    size,
    position: heldPosition,
    questionVersionId: assignment.question_version_id,
    question: toPreCommitQuestion(version),
    reveal: held.reveal,
    isLast: held.isLast,
  };
}
