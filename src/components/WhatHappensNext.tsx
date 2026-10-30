import {
  formatReviewDue,
  type ReviewOutlook,
} from "@/lib/review-outlook";

export function WhatHappensNext({
  outlook,
  className = "mt-6",
}: {
  outlook: ReviewOutlook;
  className?: string;
}) {
  return (
    <section
      className={`${className} max-w-2xl rounded-[20px] border border-[#E3EAED] bg-white p-6 shadow-[0_8px_24px_rgba(22,58,89,0.04)]`}
      aria-labelledby="what-happens-next-heading"
    >
      <h2
        id="what-happens-next-heading"
        className="text-lg font-semibold text-[#163A59]"
      >
        What Happens Next
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#5C6B74]">
        Taken from your saved Review cycles.
      </p>
      <ul className="mt-4 divide-y divide-[#EEF2F4] text-base leading-7 text-[#24313A]">
        <li className="py-2">{dueSentence(outlook.due_now)}</li>
        <li className="py-2">{nextSentence(outlook.next_due_at)}</li>
        {outlook.near_expiry > 0 ? (
          <li className="py-2">{nearSentence(outlook.near_expiry)}</li>
        ) : null}
        {outlook.expired > 0 ? (
          <li className="py-2">{expiredSentence(outlook.expired)}</li>
        ) : null}
      </ul>
    </section>
  );
}

function dueSentence(count: number): string {
  if (count === 0) {
    return "Nothing is due right now.";
  }
  if (count === 1) {
    return "1 review item is due now.";
  }
  return `${count} review items are due now.`;
}

function nextSentence(dueAt: Date | null): string {
  if (dueAt === null) {
    return "No further review is scheduled.";
  }
  return `The next review is due ${formatReviewDue(dueAt)}.`;
}

function nearSentence(count: number): string {
  if (count === 1) {
    return "1 review item is near the end of its review window.";
  }
  return `${count} review items are near the end of their review window.`;
}

function expiredSentence(count: number): string {
  if (count === 1) {
    return "1 review window has ended and stays in history.";
  }
  return `${count} review windows have ended and stay in history.`;
}
