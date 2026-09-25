import type { Metadata } from "next";
import { LearnerNav } from "@/components/LearnerNav";
import { requireEntryStep } from "@/lib/learner-gate";

export const metadata: Metadata = {
  title: "Progress",
};

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  await requireEntryStep("app");

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-5 py-16 sm:px-6">
      <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Progress
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
        Complete your first practice session to begin building your Review and
        Progress.
      </p>
      <LearnerNav current="progress" />
    </main>
  );
}
