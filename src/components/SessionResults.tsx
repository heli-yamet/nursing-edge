import type { Confidence, SixState } from "@/lib/learner-types";
import {
  CONFIDENCE_LEVELS,
  formatPercent,
  SIX_STATES,
  type ResultCounts,
  type SessionResults,
} from "@/lib/session-results";

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  UNSURE: "Unsure",
  SURE: "Sure",
  CONFIDENT: "Confident",
};

const SIX_STATE_LABELS: Record<SixState, string> = {
  CORRECT_UNSURE: "Correct and Unsure",
  CORRECT_SURE: "Correct and Sure",
  CORRECT_CONFIDENT: "Correct and Confident",
  INCORRECT_UNSURE: "Incorrect and Unsure",
  INCORRECT_SURE: "Incorrect and Sure",
  INCORRECT_CONFIDENT: "Incorrect and Confident",
};

export function SessionResultsView({ results }: { results: SessionResults }) {
  if (results.type === "REVIEW") {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <ResultsCard
          heading="Clinical questions"
          counts={results.clinical}
          detail="full"
          noAnswerText="No clinical answers were submitted in this session, so there is no accuracy to show."
        />
        {results.physiology.assigned > 0 ? (
          <ResultsCard
            heading="Physiology questions"
            counts={results.physiology}
            detail="full"
            noAnswerText="No physiology answers were submitted in this session, so there is no accuracy to show."
          />
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-6">
      <ResultsCard
        counts={results.overall}
        detail={results.type === "CALIBRATION" ? "basic" : "full"}
        noAnswerText="No answers were submitted in this session, so there is no accuracy to show."
      />
    </div>
  );
}

function ResultsCard({
  heading,
  counts,
  detail,
  noAnswerText,
}: {
  heading?: string;
  counts: ResultCounts;
  detail: "basic" | "full";
  noAnswerText: string;
}) {
  const answeredAny = counts.answered > 0;
  return (
    <section className="max-w-2xl rounded-[20px] border border-[#E3EAED] bg-white p-6 shadow-[0_8px_24px_rgba(22,58,89,0.04)]">
      {heading ? (
        <h2 className="text-lg font-semibold text-[#163A59]">{heading}</h2>
      ) : null}
      <dl className={`grid grid-cols-2 gap-4 sm:grid-cols-3 ${heading ? "mt-4" : ""}`}>
        <Fact label="Assigned" value={counts.assigned} />
        <Fact label="Answered" value={counts.answered} />
        {answeredAny ? (
          <Fact label="Accuracy" value={formatPercent(counts.accuracy)} />
        ) : null}
      </dl>
      {answeredAny ? (
        <p className="mt-3 text-sm leading-6 text-[#5C6B74]">
          {counts.correct} correct and {counts.incorrect} incorrect out of{" "}
          {counts.answered} answered.
        </p>
      ) : (
        <p className="mt-4 text-base leading-7 text-[#24313A]" role="status">
          {noAnswerText}
        </p>
      )}

      {answeredAny ? (
        <>
          <h3 className="mt-6 text-sm font-semibold tracking-[0.08em] text-[#0B7F86] uppercase">
            Confidence
          </h3>
          <ul className="mt-2 divide-y divide-[#EEF2F4]">
            {CONFIDENCE_LEVELS.map((level) => {
              const levelAccuracy = formatPercent(
                counts.accuracy_by_confidence[level],
              );
              return (
                <li
                  key={level}
                  className="flex items-baseline justify-between gap-4 py-2 text-base text-[#24313A]"
                >
                  <span>{CONFIDENCE_LABELS[level]}</span>
                  <span className="text-right">
                    {counts.confidence[level]}
                    {detail === "full" && levelAccuracy !== null ? (
                      <span className="ml-3 text-sm text-[#5C6B74]">
                        {levelAccuracy} accuracy
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {answeredAny && detail === "full" ? (
        <>
          <h3 className="mt-6 text-sm font-semibold tracking-[0.08em] text-[#0B7F86] uppercase">
            Answer and confidence
          </h3>
          <ul className="mt-2 divide-y divide-[#EEF2F4]">
            {SIX_STATES.map((state) => (
              <li
                key={state}
                className="flex items-baseline justify-between gap-4 py-2 text-base text-[#24313A]"
              >
                <span>{SIX_STATE_LABELS[state]}</span>
                <span>{counts.six_state[state]}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div>
      <dt className="text-sm text-[#5C6B74]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-[#163A59]">{value}</dd>
    </div>
  );
}
