import { getActiveCalibrationBlueprint } from "@/lib/calibration-blueprint";
import {
  planCalibrationAssignment,
  practiceEntryView,
  readCalibrationState,
  type PracticeEntryView,
} from "@/lib/calibration-entry";
import { questions, questionVersions } from "@/lib/learner-collections";
import type { Question, QuestionVersion } from "@/lib/learner-types";
import type { PracticeSupply } from "@/lib/practice-options";
import { practiceCandidates, practiceSupply } from "@/lib/practice-selection";

export type PracticeSetupData = {
  view: PracticeEntryView;
  supply: PracticeSupply;
};

export async function loadPracticeSetup(
  learnerId: string,
): Promise<PracticeSetupData> {
  const [published, questionRows, blueprint, calibrationState] =
    await Promise.all([
      (await questionVersions())
        .find({ publication_status: "PUBLISHED" }, { projection: { _id: 0 } })
        .toArray(),
      (await questions()).find({}, { projection: { _id: 0 } }).toArray(),
      getActiveCalibrationBlueprint(),
      readCalibrationState(learnerId),
    ]);

  const questionMap = new Map<string, Question>(
    questionRows.map((question) => [question.question_id, question]),
  );
  const versionMap = new Map<string, QuestionVersion>(
    published.map((version) => [version.question_version_id, version]),
  );
  const reserved = new Set(blueprint?.question_version_ids ?? []);

  return {
    view: practiceEntryView({
      calibrationState,
      baselineAvailable: planCalibrationAssignment(blueprint, versionMap).ok,
    }),
    supply: practiceSupply(practiceCandidates(published, questionMap, reserved)),
  };
}
