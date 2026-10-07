import { isSupportedInteraction } from "@/lib/eligibility-report";
import { attempts, questionVersions } from "@/lib/learner-collections";
import type { SessionType } from "@/lib/learner-types";
import {
  toPreCommitQuestion,
  type PreCommitQuestion,
} from "@/lib/player-question";
import { readActiveSession } from "@/lib/practice-setup";

export type PlayerLoad =
  | { result: "no_session" }
  | { result: "not_playable" }
  | { result: "unavailable" }
  | { result: "none_open"; size: number }
  | {
      result: "open";
      type: Extract<SessionType, "PRACTICE" | "CALIBRATION">;
      size: number;
      position: number;
      questionVersionId: string;
      question: PreCommitQuestion;
    };

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
  if (session.type !== "PRACTICE" && session.type !== "CALIBRATION") {
    return { result: "not_playable" };
  }

  const assigned = [...session.assigned_versions].sort(
    (left, right) => left.position - right.position,
  );
  const size = assigned.length;
  const committed = await (
    await attempts()
  )
    .find(
      { session_id: session.session_id },
      { projection: { _id: 0, position: 1 } },
    )
    .toArray();
  const done = new Set(committed.map((attempt) => attempt.position));
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
  if (
    !version?.stem ||
    !version.options ||
    !isSupportedInteraction(version.format)
  ) {
    return { result: "unavailable" };
  }

  return {
    result: "open",
    type: session.type,
    size,
    position: open.position,
    questionVersionId: open.question_version_id,
    question: toPreCommitQuestion(version),
  };
}
