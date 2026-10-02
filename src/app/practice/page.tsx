import type { Metadata } from "next";
import { BaselineChoice } from "@/components/BaselineChoice";
import { LearnerShell } from "@/components/LearnerShell";
import { PracticeSetupForm } from "@/components/PracticeSetupForm";
import { requireAuthorizedLearner } from "@/lib/learner-gate";
import { loadPracticeSetup } from "@/lib/practice-setup";

export const metadata: Metadata = {
  title: "Practice",
};

export const dynamic = "force-dynamic";

export default async function PracticePage() {
  const learner = await requireAuthorizedLearner();
  const setup = await loadPracticeSetup(learner.learner_id);

  return (
    <LearnerShell current="practice">
      <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Practice
      </h1>
      {setup.view === "baseline-choice" ? (
        <BaselineChoice />
      ) : (
        <PracticeSetupForm supply={setup.supply} />
      )}
    </LearnerShell>
  );
}
