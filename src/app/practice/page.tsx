import type { Metadata } from "next";
import { LearnerShell } from "@/components/LearnerShell";
import { requireAuthorizedLearner } from "@/lib/learner-gate";

export const metadata: Metadata = {
  title: "Practice",
};

export const dynamic = "force-dynamic";

export default async function PracticePage() {
  await requireAuthorizedLearner();

  return (
    <LearnerShell current="practice">
      <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Practice
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
        Practice sessions are not open yet. No questions are shown here.
      </p>
    </LearnerShell>
  );
}
