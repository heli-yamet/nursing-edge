import Link from "next/link";
import { EndSessionControl } from "@/components/EndSessionControl";
import type { Session } from "@/lib/learner-types";
import { practiceScopeLabel } from "@/lib/practice-options";

const TYPE_LABELS: Record<Session["type"], string> = {
  PRACTICE: "Practice",
  REVIEW: "Review",
  CALIBRATION: "Baseline",
};

export function ActiveSessionPanel({ session }: { session: Session }) {
  return (
    <section
      className="mt-8 rounded-[10px] border border-[#D9E1E5] bg-white p-6"
      aria-labelledby="active-session-heading"
    >
      <h2
        id="active-session-heading"
        className="text-xl font-semibold text-[#163A59]"
      >
        Session in progress
      </h2>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-base text-[#24313A]">
        <dt className="font-medium text-[#163A59]">Type</dt>
        <dd>{TYPE_LABELS[session.type]}</dd>
        <dt className="font-medium text-[#163A59]">Scope</dt>
        <dd>{practiceScopeLabel(session.scope)}</dd>
        <dt className="font-medium text-[#163A59]">Questions</dt>
        <dd>{session.assigned_versions.length}</dd>
      </dl>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/practice/session"
          className="inline-flex min-h-[48px] items-center justify-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C]"
        >
          Continue Session
        </Link>
        {session.type === "PRACTICE" || session.type === "CALIBRATION" ? (
          <EndSessionControl
            label="End Session and Start New"
            nextHref="/practice"
          />
        ) : null}
      </div>
    </section>
  );
}
