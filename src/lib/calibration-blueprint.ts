import { newPermanentId } from "@/lib/ids";
import {
  calibrationBlueprints,
  calibrationUploads,
  questionVersions,
} from "@/lib/learner-collections";
import type {
  CalibrationBlueprint,
  CalibrationUpload,
} from "@/lib/learner-types";

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

/** Versions on the current blueprint only. Practice exclusion uses `calibrationQuestionIds`. */
export async function reservedCalibrationVersionIds(): Promise<Set<string>> {
  const active = await getActiveCalibrationBlueprint();
  return new Set(active?.question_version_ids ?? []);
}

export function calibrationUploadRows(input: {
  lines: {
    question_id: string;
    question_version_id: string;
    outcome: string;
  }[];
  batchId: string;
  now: Date;
}): CalibrationUpload[] {
  const rows = new Map<string, CalibrationUpload>();
  for (const line of input.lines) {
    const question_version_id = line.question_version_id.trim();
    const question_id = line.question_id.trim();
    if (
      (line.outcome !== "PASSED" && line.outcome !== "UNCHANGED") ||
      !question_version_id ||
      !question_id
    ) {
      continue;
    }
    rows.set(question_version_id, {
      question_version_id,
      question_id,
      batch_id: input.batchId,
      marked_at: input.now,
    });
  }
  return [...rows.values()];
}

/** Records every stored version from an "Upload as Calibration" batch. The first mark is kept. */
export async function markCalibrationUploads(input: {
  lines: {
    question_id: string;
    question_version_id: string;
    outcome: string;
  }[];
  batchId: string;
  now?: Date;
}): Promise<number> {
  const rows = calibrationUploadRows({
    lines: input.lines,
    batchId: input.batchId,
    now: input.now ?? new Date(),
  });
  if (rows.length === 0) {
    return 0;
  }
  await (await calibrationUploads()).bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: { question_version_id: row.question_version_id },
        update: { $setOnInsert: row },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return rows.length;
}

/**
 * Baseline questions stay out of Practice for good: anything uploaded as
 * Calibration, and anything on any blueprint, current or replaced.
 */
export function calibrationQuestionIdsFrom(input: {
  uploadedQuestionIds: Iterable<string>;
  blueprintVersionIds: Iterable<string>;
  versionToQuestion: ReadonlyMap<string, string>;
}): Set<string> {
  const ids = new Set<string>();
  for (const question_id of input.uploadedQuestionIds) {
    ids.add(question_id);
  }
  for (const question_version_id of input.blueprintVersionIds) {
    const question_id = input.versionToQuestion.get(question_version_id);
    if (question_id) {
      ids.add(question_id);
    }
  }
  return ids;
}

export function calibrationVersionIdsFor(
  versions: { question_id: string; question_version_id: string }[],
  calibrationQuestionIds: ReadonlySet<string>,
): Set<string> {
  return new Set(
    versions
      .filter((version) => calibrationQuestionIds.has(version.question_id))
      .map((version) => version.question_version_id),
  );
}

export async function calibrationQuestionIds(): Promise<Set<string>> {
  const [uploaded, blueprints] = await Promise.all([
    (await calibrationUploads())
      .find({}, { projection: { _id: 0, question_id: 1 } })
      .toArray(),
    (await calibrationBlueprints())
      .find({}, { projection: { _id: 0, question_version_ids: 1 } })
      .toArray(),
  ]);
  const blueprintVersionIds = [
    ...new Set(blueprints.flatMap((blueprint) => blueprint.question_version_ids)),
  ];
  const versions =
    blueprintVersionIds.length === 0
      ? []
      : await (await questionVersions())
          .find(
            { question_version_id: { $in: blueprintVersionIds } },
            { projection: { _id: 0, question_version_id: 1, question_id: 1 } },
          )
          .toArray();
  return calibrationQuestionIdsFrom({
    uploadedQuestionIds: uploaded.map((row) => row.question_id),
    blueprintVersionIds,
    versionToQuestion: new Map(
      versions.map((version) => [version.question_version_id, version.question_id]),
    ),
  });
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
