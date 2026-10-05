import { findAttemptsBySession, questionVersions } from "@/lib/learner-collections";
import type { SessionType } from "@/lib/learner-types";
import {
  nextOpenAssignment,
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
      position: number;
      size: number;
      question: PreCommitQuestion;
    };

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

  const attempts = await findAttemptsBySession(session.session_id);
  const assignment = nextOpenAssignment(
    session.assigned_versions,
    new Set(attempts.map((attempt) => attempt.question_version_id)),
  );
  const size = session.assigned_versions.length;
  if (!assignment) {
    return { result: "none_open", size };
  }

  const version = await (
    await questionVersions()
  ).findOne(
    { question_version_id: assignment.question_version_id },
    {
      projection: {
        _id: 0,
        stem: 1,
        "options.option_id": 1,
        "options.displayed_option": 1,
        "options.option_text": 1,
      },
    },
  );
  if (!version?.stem || !version.options) {
    return { result: "unavailable" };
  }

  return {
    result: "open",
    type: session.type,
    position: assignment.position,
    size,
    question: toPreCommitQuestion(version),
  };
}
