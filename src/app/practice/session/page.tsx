import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LearnerShell } from "@/components/LearnerShell";
import { OpenQuestion } from "@/components/OpenQuestion";
import { requireAuthorizedLearner } from "@/lib/learner-gate";
import { loadOpenPlayerQuestion } from "@/lib/player-load";

export const metadata: Metadata = {
  title: "Question",
};

export const dynamic = "force-dynamic";

const TYPE_LABELS = {
  PRACTICE: "Practice",
  CALIBRATION: "Baseline",
} as const;

export default async function PracticeSessionPage() {
  const learner = await requireAuthorizedLearner();
  const loaded = await loadOpenPlayerQuestion(learner.learner_id);
  if (loaded.result === "no_session") {
    redirect("/practice");
  }

  return (
    <LearnerShell current="practice" dashboard>
      <div className="pt-8">
      {loaded.result === "open" || loaded.result === "feedback" ? (
        <OpenQuestion
          key={loaded.position}
          label={TYPE_LABELS[loaded.type]}
          position={loaded.position}
          size={loaded.size}
          questionVersionId={loaded.questionVersionId}
          stem={loaded.question.stem}
          format={loaded.question.format}
          options={loaded.question.options}
          initialSelectedIds={
            loaded.result === "feedback"
              ? loaded.reveal.selection.map((option) => option.option_id)
              : loaded.draft?.selected_option_ids
          }
          initialConfidence={
            loaded.result === "feedback"
              ? loaded.reveal.confidence === "Unsure"
                ? "UNSURE"
                : loaded.reveal.confidence === "Sure"
                  ? "SURE"
                  : "CONFIDENT"
              : loaded.draft?.confidence
          }
          initialReveal={loaded.result === "feedback" ? loaded.reveal : null}
          initialIsLast={loaded.result === "feedback" ? loaded.isLast : false}
        />
      ) : loaded.result === "unavailable" ? (
        <p className="text-base leading-7 text-[#24313A]" role="status">
          This question is temporarily unavailable. Your session progress is
          saved.
        </p>
      ) : loaded.result === "none_open" ? (
        <p className="text-base leading-7 text-[#24313A]" role="status">
          Every question in this session already has a submitted answer.
        </p>
      ) : (
        <div>
          <p className="text-base leading-7 text-[#24313A]">
            This player opens a Practice or Baseline session.
          </p>
          <Link
            href="/practice"
            className="mt-6 inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C]"
          >
            Back to Practice
          </Link>
        </div>
      )}
      </div>
    </LearnerShell>
  );
}
