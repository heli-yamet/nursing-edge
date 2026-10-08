import type { Metadata } from "next";
import { LearnerShell } from "@/components/LearnerShell";
import { requireAuthorizedLearner } from "@/lib/learner-gate";

export const metadata: Metadata = {
  title: "Review",
};

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  await requireAuthorizedLearner();

  return (
    <LearnerShell current="review" dashboard>
      <h1 className="pt-8 text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Review
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
        No review items yet. Complete a practice session to begin building your
        review.
      </p>
    </LearnerShell>
  );
}
