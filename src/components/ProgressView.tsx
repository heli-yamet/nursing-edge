import {
  CHANGE_CLASS_LABELS,
  CHANGE_CLASSES,
  type ChangeClass,
} from "@/lib/change-evidence";
import {
  CONFIDENCE_LEVELS,
  type LearnerProgress,
} from "@/lib/learner-progress";
import type { Confidence } from "@/lib/learner-types";
import {
  formatPercent,
  type ResultCounts,
} from "@/lib/session-results";

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  UNSURE: "Unsure",
  SURE: "Sure",
  CONFIDENT: "Confident",
};

export function ProgressView({ progress }: { progress: LearnerProgress }) {
  const visibleTopics = progress.topics.filter((row) => row.visible);

  return (
    <div className="mt-6 flex max-w-2xl flex-col gap-4">
      <ProgressCountsCard
        heading="Current Progress"
        intro="Based on your most recent answer to each clinical question you have attempted."
        counts={progress.current}
        noAnswerText="No clinical answers are recorded yet, so there is no accuracy to show."
      />

      <FirstToCurrentCard summary={progress.first_to_current} />

      {visibleTopics.length > 0 ? (
        <TopicAccuracyChart topics={visibleTopics} />
      ) : null}

      <EvidenceByTopicCard topics={progress.topics} />

      {progress.physiology.answered > 0 ? (
        <ProgressCountsCard
          heading="Physiology questions"
          intro="Applied Pathophysiology answers are counted separately from clinical questions."
          counts={progress.physiology}
          noAnswerText="No physiology answers are recorded yet."
        />
      ) : null}
    </div>
  );
}

function ProgressCountsCard({
  heading,
  intro,
  counts,
  noAnswerText,
}: {
  heading: string;
  intro: string;
  counts: ResultCounts;
  noAnswerText: string;
}) {
  const answeredAny = counts.answered > 0;
  return (
    <section className="rounded-[20px] border border-[#E3EAED] bg-white p-6 shadow-[0_8px_24px_rgba(22,58,89,0.04)]">
      <h2 className="text-lg font-semibold text-[#163A59]">{heading}</h2>
      <p className="mt-2 text-sm leading-6 text-[#5C6B74]">{intro}</p>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Fact label="Questions" value={counts.assigned} />
        <Fact label="Answered" value={counts.answered} />
        {answeredAny ? (
          <Fact label="Accuracy" value={formatPercent(counts.accuracy)} />
        ) : null}
      </dl>
      {answeredAny ? (
        <p className="mt-3 text-sm leading-6 text-[#5C6B74]">
          {counts.correct} correct and {counts.incorrect} incorrect.
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
                    {levelAccuracy !== null ? (
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
    </section>
  );
}

function FirstToCurrentCard({
  summary,
}: {
  summary: LearnerProgress["first_to_current"];
}) {
  const rows = CHANGE_CLASSES.filter(
    (key: ChangeClass) => summary.classified[key] > 0,
  );
  const hasAny =
    rows.length > 0 || summary.insufficient_evidence > 0;
  if (!hasAny) {
    return null;
  }
  return (
    <section className="rounded-[20px] border border-[#E3EAED] bg-white p-6 shadow-[0_8px_24px_rgba(22,58,89,0.04)]">
      <h2 className="text-lg font-semibold text-[#163A59]">
        First to current change
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#5C6B74]">
        How your latest answer on each clinical question compares with your first
        answer on that question.
      </p>
      <ul className="mt-4 divide-y divide-[#EEF2F4]">
        {rows.map((key: ChangeClass) => (
          <li
            key={key}
            className="flex items-baseline justify-between gap-4 py-2 text-base text-[#24313A]"
          >
            <span>{CHANGE_CLASS_LABELS[key]}</span>
            <span>{summary.classified[key]}</span>
          </li>
        ))}
        {summary.insufficient_evidence > 0 ? (
          <li className="flex items-baseline justify-between gap-4 py-2 text-base text-[#24313A]">
            <span>Insufficient evidence</span>
            <span>{summary.insufficient_evidence}</span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function EvidenceByTopicCard({
  topics,
}: {
  topics: LearnerProgress["topics"];
}) {
  return (
    <section className="rounded-[20px] border border-[#E3EAED] bg-white p-6 shadow-[0_8px_24px_rgba(22,58,89,0.04)]">
      <h2 className="text-lg font-semibold text-[#163A59]">Evidence by topic</h2>
      <p className="mt-2 text-sm leading-6 text-[#5C6B74]">
        A topic appears after 10 clinical answers in it. Accuracy uses the same
        calculation as Results.
      </p>
      <ul className="mt-4 divide-y divide-[#EEF2F4]">
        {topics.map((topic) => (
          <li
            key={topic.topic_id}
            className="flex flex-col gap-1 py-3 text-base text-[#24313A] sm:flex-row sm:items-baseline sm:justify-between"
          >
            <span>{topic.name}</span>
            {topic.visible ? (
              <span className="text-right text-sm text-[#5C6B74]">
                {formatPercent(topic.accuracy)} accuracy ({topic.correct} of{" "}
                {topic.answered})
              </span>
            ) : (
              <span className="text-sm text-[#5C6B74]">
                {topic.answered} of 10 answers needed
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopicAccuracyChart({
  topics,
}: {
  topics: LearnerProgress["topics"];
}) {
  const width = 640;
  const height = 40 + topics.length * 36;
  const labelWidth = 280;
  const barMax = width - labelWidth - 48;
  const barHeight = 20;

  return (
    <section className="rounded-[20px] border border-[#E3EAED] bg-white p-6 shadow-[0_8px_24px_rgba(22,58,89,0.04)]">
      <h2 className="text-lg font-semibold text-[#163A59]">Topic accuracy</h2>
      <p className="mt-2 text-sm leading-6 text-[#5C6B74]">
        Clinical accuracy by topic for topics with at least 10 answers.
      </p>
      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[320px] w-full max-w-[640px]"
          role="img"
          aria-label="Bar chart of clinical accuracy by topic"
        >
          {topics.map((topic, index) => {
            const y = 16 + index * 36;
            const accuracy = topic.accuracy ?? 0;
            const barWidth = Math.max(0, accuracy * barMax);
            return (
              <g key={topic.topic_id}>
                <text
                  x={0}
                  y={y + barHeight - 4}
                  className="fill-[#24313A] text-[11px]"
                  fontSize={11}
                >
                  {truncateLabel(topic.name, 38)}
                </text>
                <rect
                  x={labelWidth}
                  y={y}
                  width={barMax}
                  height={barHeight}
                  rx={4}
                  className="fill-[#EEF2F4]"
                />
                <rect
                  x={labelWidth}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={4}
                  className="fill-[#0B7F86]"
                />
                <text
                  x={labelWidth + barMax + 8}
                  y={y + barHeight - 4}
                  className="fill-[#5C6B74] text-[11px]"
                  fontSize={11}
                >
                  {formatPercent(topic.accuracy)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function truncateLabel(label: string, max: number): string {
  if (label.length <= max) {
    return label;
  }
  return `${label.slice(0, max - 1)}…`;
}

function Fact({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div>
      <dt className="text-sm text-[#5C6B74]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-[#163A59]">{value}</dd>
    </div>
  );
}
