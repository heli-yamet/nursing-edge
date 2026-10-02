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
      className="mt-8 max-w-xl rounded-[10px] border border-[#D9E1E5] bg-white p-6"
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
      <div className="mt-6">
        <button
          type="button"
          disabled
          aria-describedby="continue-not-open"
          className="inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white disabled:opacity-60"
        >
          Continue Session
        </button>
        <p id="continue-not-open" className="mt-3 text-sm leading-6 text-[#66727A]">
          Your questions are saved and will stay the same. The question player
          opens in the next release.
        </p>
      </div>
    </section>
  );
}
