import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LearnerShell } from "@/components/LearnerShell";
import { endedSessionCopy } from "@/lib/end-session";
import { requireAuthorizedLearner } from "@/lib/learner-gate";
import { readLatestEndedSummary } from "@/lib/mongo-session-store";
import { readActiveSession } from "@/lib/practice-setup";

export const metadata: Metadata = {
  title: "Session Ended",
};

export const dynamic = "force-dynamic";

export default async function SessionEndedPage() {
  const learner = await requireAuthorizedLearner();
  const active = await readActiveSession(learner.learner_id);
  if (active) {
    redirect("/practice/session");
  }
  const ended = await readLatestEndedSummary(learner.learner_id);
  if (!ended) {
    redirect("/practice");
  }

  return (
    <LearnerShell current="practice" dashboard>
      <div className="pt-8">
        <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
          Session Ended
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
          {endedSessionCopy(ended.submitted)}
        </p>
        <Link
          href="/practice"
          className="mt-6 inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C]"
        >
          Start Practice
        </Link>
      </div>
    </LearnerShell>
  );
}
