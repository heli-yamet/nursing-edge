import type { Metadata } from "next";
import { ProgressView } from "@/components/ProgressView";
import { WhatHappensNext } from "@/components/WhatHappensNext";
import { LearnerShell } from "@/components/LearnerShell";
import { requireAuthorizedLearner } from "@/lib/learner-gate";
import { readLearnerProgress } from "@/lib/mongo-progress";
import { readReviewOutlook } from "@/lib/review-setup";

export const metadata: Metadata = {
  title: "Progress",
};

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const learner = await requireAuthorizedLearner();
  const [progress, outlook] = await Promise.all([
    readLearnerProgress(learner.learner_id),
    readReviewOutlook(learner.learner_id),
  ]);

  return (
    <LearnerShell current="progress" dashboard>
      <h1 className="pt-8 text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Progress
      </h1>
      <WhatHappensNext outlook={outlook} />
      {progress.has_clinical_evidence ? (
        <ProgressView progress={progress} />
      ) : (
        <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
          Complete your first practice session to begin building your Review and
          Progress.
        </p>
      )}
    </LearnerShell>
  );
}
