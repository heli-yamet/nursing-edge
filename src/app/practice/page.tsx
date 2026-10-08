import type { Metadata } from "next";
import { ActiveSessionPanel } from "@/components/ActiveSessionPanel";
import { BaselineChoice } from "@/components/BaselineChoice";
import { LearnerShell } from "@/components/LearnerShell";
import { PracticeSetupForm } from "@/components/PracticeSetupForm";
import { requireAuthorizedLearner } from "@/lib/learner-gate";
import { loadPracticeSetup, readActiveSession } from "@/lib/practice-setup";

export const metadata: Metadata = {
  title: "Practice",
};

export const dynamic = "force-dynamic";

export default async function PracticePage() {
  const learner = await requireAuthorizedLearner();
  const active = await readActiveSession(learner.learner_id);
  const setup = active ? null : await loadPracticeSetup(learner.learner_id);

  return (
    <LearnerShell current="practice" dashboard>
      <h1 className="pt-8 text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Practice
      </h1>
      {active ? (
        <ActiveSessionPanel session={active} />
      ) : setup?.view === "baseline-choice" ? (
        <BaselineChoice />
      ) : setup ? (
        <PracticeSetupForm supply={setup.supply} />
      ) : null}
    </LearnerShell>
  );
}
