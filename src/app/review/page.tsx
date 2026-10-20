import type { Metadata } from "next";
import Link from "next/link";
import { EndSessionControl } from "@/components/EndSessionControl";
import { LearnerShell } from "@/components/LearnerShell";
import { OpenQuestion } from "@/components/OpenQuestion";
import { requireAuthorizedLearner } from "@/lib/learner-gate";
import { loadOpenPlayerQuestion } from "@/lib/player-load";
import { startLearnerReviewSession } from "@/lib/review-setup";

export const metadata: Metadata = {
  title: "Review",
};

export const dynamic = "force-dynamic";

const buttonClass =
  "mt-6 inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C]";

export default async function ReviewPage() {
  const learner = await requireAuthorizedLearner();
  const started = await startLearnerReviewSession(learner.learner_id);

  if (started.result === "other_session") {
    return (
      <LearnerShell current="review" dashboard>
        <h1 className="pt-8 text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
          Review
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
          Another session is open. Finish or end it before starting Review.
        </p>
        <Link href="/practice/session" className={buttonClass}>
          Continue Session
        </Link>
      </LearnerShell>
    );
  }

  if (started.result === "none_due") {
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

  if (started.result === "unavailable") {
    return (
      <LearnerShell current="review" dashboard>
        <h1 className="pt-8 text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
          Review
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]" role="status">
          A review question is due, but it is temporarily unavailable.
        </p>
      </LearnerShell>
    );
  }

  const loaded = await loadOpenPlayerQuestion(learner.learner_id);

  return (
    <LearnerShell current="review" dashboard>
      <div className="pt-8">
        {loaded.result === "open" || loaded.result === "feedback" ? (
          loaded.type === "REVIEW" ? (
            <OpenQuestion
              key={loaded.position}
              label="Review"
              position={loaded.position}
              size={loaded.size}
              questionVersionId={loaded.questionVersionId}
              stem={loaded.question.stem}
              format={loaded.question.format}
              options={loaded.question.options}
              endHref="/review/ended"
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
          ) : (
            <div>
              <p className="text-base leading-7 text-[#24313A]">
                A practice session is open.
              </p>
              <Link href="/practice/session" className={buttonClass}>
                Continue Session
              </Link>
            </div>
          )
        ) : loaded.result === "unavailable" ? (
          <div>
            <p className="text-base leading-7 text-[#24313A]" role="status">
              This question is temporarily unavailable. Your session progress is
              saved.
            </p>
            <div className="mt-6">
              <EndSessionControl label="End Session" nextHref="/review/ended" />
            </div>
          </div>
        ) : loaded.result === "none_open" ? (
          <div>
            <p className="text-base leading-7 text-[#24313A]" role="status">
              Every question in this session already has a submitted answer.
            </p>
            <div className="mt-6">
              <EndSessionControl label="End Session" nextHref="/review/ended" />
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
              Review
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
              No review items yet. Complete a practice session to begin building
              your review.
            </p>
          </div>
        )}
      </div>
    </LearnerShell>
  );
}
