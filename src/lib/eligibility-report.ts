import { isLearnerEligible } from "@/lib/stage-import";
import type { QuestionVersion } from "@/lib/learner-types";

export const LAUNCH_ELIGIBLE_MINIMUM = 2000;

export type EligibilityReport = {
  imported: number;
  published: number;
  mvp_eligible: number;
  calibration_reserved: number;
  unavailable_invalid: number;
  unsupported_interaction: number;
  launch_eligible_minimum: number;
  launch_gate_met: boolean;
};

export function isSupportedInteraction(format: string): boolean {
  return format === "MCQ" || format === "SATA";
}

export function isReservedForCalibration(
  questionVersionId: string,
  reservedIds: ReadonlySet<string> = new Set(),
): boolean {
  return reservedIds.has(questionVersionId);
}

export function isMvpEligible(
  version: QuestionVersion,
  reservedIds: ReadonlySet<string> = new Set(),
): boolean {
  return (
    !isReservedForCalibration(version.question_version_id, reservedIds) &&
    isLearnerEligible(version) &&
    isSupportedInteraction(version.format)
  );
}

export function listEligibleVersions(
  versions: QuestionVersion[],
  reservedIds: ReadonlySet<string> = new Set(),
): QuestionVersion[] {
  return versions.filter((version) => isMvpEligible(version, reservedIds));
}

export function buildEligibilityReport(
  versions: QuestionVersion[],
  reservedIds: ReadonlySet<string> = new Set(),
): EligibilityReport {
  let published = 0;
  let unsupported_interaction = 0;
  let calibration_reserved = 0;

  for (const version of versions) {
    if (!isSupportedInteraction(version.format)) {
      unsupported_interaction += 1;
    }
    if (version.publication_status === "PUBLISHED") {
      published += 1;
    }
    if (isReservedForCalibration(version.question_version_id, reservedIds)) {
      calibration_reserved += 1;
    }
  }

  const imported = versions.length;
  const mvp_eligible = listEligibleVersions(versions, reservedIds).length;
  return {
    imported,
    published,
    mvp_eligible,
    calibration_reserved,
    unavailable_invalid: imported - mvp_eligible - calibration_reserved,
    unsupported_interaction,
    launch_eligible_minimum: LAUNCH_ELIGIBLE_MINIMUM,
    launch_gate_met: mvp_eligible >= LAUNCH_ELIGIBLE_MINIMUM,
  };
}
