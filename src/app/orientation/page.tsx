import type { Metadata } from "next";
import { BeginOrientationForm } from "@/components/BeginOrientationForm";
import { requireEntryStep } from "@/lib/learner-gate";

export const metadata: Metadata = {
  title: "How Nursing Edge Works",
};

export const dynamic = "force-dynamic";

export default async function OrientationPage() {
  await requireEntryStep("orientation");

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-5 py-16 sm:px-6">
      <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        How Nursing Edge Works
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
        For every question, choose your answer and then tell us how certain you
        are: Unsure — Sure — Confident. Select your confidence before
        submitting. Nursing Edge uses both your answer and your confidence to
        determine what may need reinforcement and what should be reviewed
        again. Answer honestly. Confidence is not graded as right or wrong.
      </p>
      <BeginOrientationForm />
    </main>
  );
}
