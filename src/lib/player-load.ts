import { isSupportedInteraction } from "@/lib/eligibility-report";
import { questionVersions } from "@/lib/learner-collections";
import type { SessionType } from "@/lib/learner-types";
import {
  toPreCommitQuestion,
  type PreCommitQuestion,
} from "@/lib/player-question";
import { readActiveSession } from "@/lib/practice-setup";

export type BrowseQuestion = {
  position: number;
  question: PreCommitQuestion;
};

export type PlayerLoad =
  | { result: "no_session" }
  | { result: "not_playable" }
  | { result: "unavailable" }
  | { result: "none_open"; size: number }
  | {
      result: "open";
      type: Extract<SessionType, "PRACTICE" | "CALIBRATION">;
      size: number;
      questions: BrowseQuestion[];
    };

const QUESTION_PROJECTION = {
  _id: 0,
  question_version_id: 1,
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
    (a, b) => a.position - b.position,
  );
  const size = assigned.length;
  if (size === 0) {
    return { result: "none_open", size };
  }

  const versions = await (
    await questionVersions()
  )
    .find(
      {
        question_version_id: {
          $in: assigned.map((item) => item.question_version_id),
        },
      },
      { projection: QUESTION_PROJECTION },
    )
    .toArray();
  const byId = new Map(
    versions.map((version) => [version.question_version_id, version]),
  );
  const questions: BrowseQuestion[] = [];
  for (const item of assigned) {
    const version = byId.get(item.question_version_id);
    if (
      !version?.stem ||
      !version.options ||
      !isSupportedInteraction(version.format)
    ) {
      continue;
    }
    questions.push({
      position: item.position,
      question: toPreCommitQuestion(version),
    });
  }
  if (questions.length === 0) {
    return { result: "unavailable" };
  }

  return {
    result: "open",
    type: session.type,
    size,
    questions,
  };
}
