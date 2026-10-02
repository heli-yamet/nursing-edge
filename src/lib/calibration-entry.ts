import { CALIBRATION_BLUEPRINT_SIZE } from "@/lib/calibration-blueprint";
import { isSupportedInteraction } from "@/lib/eligibility-report";
import { newPermanentId } from "@/lib/ids";
import { calibrations } from "@/lib/learner-collections";
import type {
  AssignedVersion,
  CalibrationBlueprint,
  CalibrationState,
  QuestionVersion,
} from "@/lib/learner-types";
import { isLearnerEligible } from "@/lib/stage-import";

export type CalibrationAssignment =
  | { ok: true; assigned_versions: AssignedVersion[] }
  | { ok: false; reason: "no_blueprint" | "blueprint_unavailable" };

export function planCalibrationAssignment(
  blueprint: Pick<CalibrationBlueprint, "question_version_ids"> | null,
  versions: Map<string, QuestionVersion>,
): CalibrationAssignment {
  if (!blueprint) {
    return { ok: false, reason: "no_blueprint" };
  }
  const ids = blueprint.question_version_ids;
  const assigned: AssignedVersion[] = [];
  const questionIds = new Set<string>();
  for (const question_version_id of ids) {
    const version = versions.get(question_version_id);
    if (
      !version ||
      !isLearnerEligible(version) ||
      !isSupportedInteraction(version.format) ||
      questionIds.has(version.question_id)
    ) {
      return { ok: false, reason: "blueprint_unavailable" };
    }
    questionIds.add(version.question_id);
    assigned.push({
      position: assigned.length + 1,
      question_id: version.question_id,
      question_version_id,
    });
  }
  if (assigned.length !== CALIBRATION_BLUEPRINT_SIZE) {
    return { ok: false, reason: "blueprint_unavailable" };
  }
  return { ok: true, assigned_versions: assigned };
}

export type PracticeEntryView = "baseline-choice" | "setup";

export function practiceEntryView(input: {
  calibrationState: CalibrationState;
  baselineAvailable: boolean;
}): PracticeEntryView {
  if (input.calibrationState === "NOT_CHOSEN" && input.baselineAvailable) {
    return "baseline-choice";
  }
  return "setup";
}

export async function readCalibrationState(
  learnerId: string,
): Promise<CalibrationState> {
  const record = await (await calibrations()).findOne(
    { learner_id: learnerId },
    { projection: { _id: 0, state: 1 } },
  );
  return record?.state ?? "NOT_CHOSEN";
}

export async function declineCalibration(
  learnerId: string,
  now: Date = new Date(),
): Promise<CalibrationState> {
  const collection = await calibrations();
  try {
    await collection.updateOne(
      { learner_id: learnerId },
      {
        $setOnInsert: {
          calibration_id: newPermanentId(),
          learner_id: learnerId,
          state: "DECLINED",
          blueprint_id: null,
          blueprint_version: null,
          assigned_versions: [],
          started_at: null,
          completed_at: null,
          declined_at: now,
          created_at: now,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    const duplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000;
    if (!duplicate) {
      throw error;
    }
  }
  return readCalibrationState(learnerId);
}
