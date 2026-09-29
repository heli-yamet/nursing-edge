import { newPermanentId } from "@/lib/ids";
import { calibrationBlueprints } from "@/lib/learner-collections";
import type { CalibrationBlueprint } from "@/lib/learner-types";

export const CALIBRATION_BLUEPRINT_SIZE = 35;

export type CalibrationBlueprintPlan = {
  ok: boolean;
  reason: string | null;
  question_version_ids: string[];
};

export function uniqueSuccessfulVersionIds(
  lines: { question_version_id: string; outcome: string }[],
): string[] {
  return [
    ...new Set(
      lines
        .filter(
          (line) => line.outcome === "PASSED" || line.outcome === "UNCHANGED",
        )
        .map((line) => line.question_version_id.trim())
        .filter((id) => id.length > 0),
    ),
  ];
}

export function planCalibrationBlueprint(
  questionVersionIds: string[],
): CalibrationBlueprintPlan {
  const ids = [
    ...new Set(
      questionVersionIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
  if (ids.length !== CALIBRATION_BLUEPRINT_SIZE) {
    return {
      ok: false,
      reason: `Calibration must be exactly ${CALIBRATION_BLUEPRINT_SIZE} question versions.`,
      question_version_ids: [],
    };
  }
  return { ok: true, reason: null, question_version_ids: ids };
}

export async function getActiveCalibrationBlueprint(): Promise<CalibrationBlueprint | null> {
  return (await calibrationBlueprints()).findOne({ active: true });
}

export async function reservedCalibrationVersionIds(): Promise<Set<string>> {
  const active = await getActiveCalibrationBlueprint();
  return new Set(active?.question_version_ids ?? []);
}

export async function saveCalibrationBlueprint(input: {
  questionVersionIds: string[];
  actorAdminId: string | null;
  name?: string;
  version?: string;
  now?: Date;
}): Promise<
  | { ok: true; blueprint: CalibrationBlueprint }
  | { ok: false; reason: string; blueprint: null }
> {
  const plan = planCalibrationBlueprint(input.questionVersionIds);
  if (!plan.ok) {
    return {
      ok: false,
      reason: plan.reason ?? "Nothing was saved.",
      blueprint: null,
    };
  }

  const collection = await calibrationBlueprints();
  const previousCount = await collection.countDocuments();
  const blueprint: CalibrationBlueprint = {
    blueprint_id: newPermanentId(),
    name: input.name?.trim() || "Calibration",
    version: input.version?.trim() || String(previousCount + 1),
    question_version_ids: plan.question_version_ids,
    active: true,
    actor_admin_id: input.actorAdminId,
    created_at: input.now ?? new Date(),
  };

  await collection.updateMany({ active: true }, { $set: { active: false } });
  await collection.insertOne(blueprint);
  return { ok: true, blueprint };
}
