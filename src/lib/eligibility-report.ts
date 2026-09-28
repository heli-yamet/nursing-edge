import { isLearnerEligible } from "@/lib/stage-import";
import type { QuestionVersion } from "@/lib/learner-types";

export const LAUNCH_ELIGIBLE_MINIMUM = 2000;

export type EligibilityReport = {
  imported: number;
  published: number;
  mvp_eligible: number;
  unavailable_invalid: number;
  unsupported_interaction: number;
  launch_eligible_minimum: number;
  launch_gate_met: boolean;
};

export function isSupportedInteraction(format: string): boolean {
  return format === "MCQ" || format === "SATA";
}

export function buildEligibilityReport(
  versions: QuestionVersion[],
): EligibilityReport {
  let published = 0;
  let mvp_eligible = 0;
  let unsupported_interaction = 0;

  for (const version of versions) {
    if (!isSupportedInteraction(version.format)) {
      unsupported_interaction += 1;
    }
    if (version.publication_status === "PUBLISHED") {
      published += 1;
    }
    if (
      isLearnerEligible(version) &&
      isSupportedInteraction(version.format)
    ) {
      mvp_eligible += 1;
    }
  }

  const imported = versions.length;
  return {
    imported,
    published,
    mvp_eligible,
    unavailable_invalid: imported - mvp_eligible,
    unsupported_interaction,
    launch_eligible_minimum: LAUNCH_ELIGIBLE_MINIMUM,
    launch_gate_met: mvp_eligible >= LAUNCH_ELIGIBLE_MINIMUM,
  };
}
