import type { Metadata } from "next";
import Link from "next/link";
import { LearnerNav } from "@/components/LearnerNav";
import { requireEntryStep } from "@/lib/learner-gate";
import { sessions } from "@/lib/learner-collections";
import { HOME_ACTIONS, homeActionOrder } from "@/lib/session-rules";

export const metadata: Metadata = {
  title: "Home",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const learner = await requireEntryStep("app");
  const active = await (await sessions()).findOne(
    { learner_id: learner.learner_id, state: "ACTIVE" },
    { projection: { _id: 1 } },
  );
  const hasActiveSession = Boolean(active);
  const actions = homeActionOrder({
    hasActiveSession,
    reviewDue: false,
  });

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-5 py-16 sm:px-6">
      <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Home
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
        Hello, {learner.first_name}.
        {hasActiveSession
          ? null
          : " Complete your first practice session to begin building your Review and Progress."}
      </p>
      <div className="mt-8 flex flex-col items-start gap-3">
        {actions.map((id, index) => {
          const action = HOME_ACTIONS[id];
          const primary = index === 0;
          return (
            <Link
              key={id}
              href={action.href}
              className={`inline-flex min-h-[48px] items-center rounded-[10px] px-5 text-base font-medium ${
                primary
                  ? "bg-[#0B7F86] text-white"
                  : "border border-[#0B7F86] bg-white text-[#0B7F86] hover:bg-[#F7F9FA]"
              }`}
            >
              {action.label}
            </Link>
          );
        })}
      </div>
      <LearnerNav current="home" />
    </main>
  );
}
