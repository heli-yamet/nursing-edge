import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LearnerShell } from "@/components/LearnerShell";
import { SessionResultsView } from "@/components/SessionResults";
import { endedSessionCopy } from "@/lib/end-session";
import { requireAuthorizedLearner } from "@/lib/learner-gate";
import { readLatestEndedResults } from "@/lib/mongo-session-store";
import { readActiveSession } from "@/lib/practice-setup";
import { RESULTS_TITLES, totalAnswered } from "@/lib/session-results";

export const metadata: Metadata = {
  title: "Review Results",
};

export const dynamic = "force-dynamic";

export default async function ReviewEndedPage() {
  const learner = await requireAuthorizedLearner();
  const active = await readActiveSession(learner.learner_id);
  if (active?.type === "REVIEW") {
    redirect("/review");
  }
  if (active) {
    redirect("/practice/session");
  }
  const results = await readLatestEndedResults(learner.learner_id, ["REVIEW"]);
  if (!results) {
    redirect("/review");
  }

  return (
    <LearnerShell current="review" dashboard>
      <div className="pt-8">
        <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
          {RESULTS_TITLES[results.type]}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
          {endedSessionCopy(totalAnswered(results))}
        </p>
        <SessionResultsView results={results} />
        <Link
          href="/review"
          className="mt-6 inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C]"
        >
          Back to Review
        </Link>
      </div>
    </LearnerShell>
  );
}
