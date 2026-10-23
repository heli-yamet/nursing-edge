"use client";

import { useEffect, useId, useState } from "react";
import type { InterviewOpening, InterviewStep } from "@/lib/review-interview";

const panelClass =
  "mt-5 rounded-[16px] border border-[#D9E1E5] bg-[#F7F9FA] px-5 py-5";

const textareaClass =
  "mt-2 block min-h-[96px] w-full rounded-[10px] border border-[#D9E1E5] bg-white px-3 py-2 text-base leading-7 text-[#24313A] focus-visible:outline-2 focus-visible:outline-[#0B7F86]";

const primaryButtonClass =
  "inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const secondaryButtonClass =
  "inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] border border-[#D9E1E5] bg-white px-5 text-base font-medium text-[#163A59] hover:bg-[#F7F9FA] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const DEFAULT_COMMITMENT = "Write a brief explanation of your reasoning.";
const STEP_FAILURE =
  "This optional step could not continue. You can try again or answer the question.";

type Phase = "first" | "second" | "closed";

export function ReviewInterview({
  interview,
  position,
  questionVersionId,
  disabled,
}: {
  interview: InterviewOpening;
  position: number;
  questionVersionId: string;
  disabled: boolean;
}) {
  const firstId = useId();
  const secondId = useId();
  const [phase, setPhase] = useState<Phase>("first");
  const [firstNotes, setFirstNotes] = useState("");
  const [secondNotes, setSecondNotes] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [secondPrompt, setSecondPrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deliver(step: InterviewStep): Promise<string | null> {
    try {
      const response = await fetch("/api/learner/sessions/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          position,
          question_version_id: questionVersionId,
          teaching_id: interview.teaching_id,
          teaching_revision: interview.teaching_revision,
          kind: step.kind,
          prompt_number: step.kind === "PROMPT" ? step.prompt_number : null,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; text?: unknown };
      if (!response.ok || !body.ok || typeof body.text !== "string") {
        return null;
      }
      return body.text;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    void deliver({ kind: "PROMPT", prompt_number: 1 });
  }, [position, questionVersionId, interview.teaching_id, interview.teaching_revision]);

  async function continueFirst() {
    if (busy || firstNotes.trim() === "") {
      return;
    }
    setBusy(true);
    setError(null);
    const guidance = feedback ?? (await deliver({ kind: "METHOD_FEEDBACK" }));
    if (guidance === null) {
      setError(STEP_FAILURE);
      setBusy(false);
      return;
    }
    setFeedback(guidance);
    if (interview.prompt_count >= 2) {
      const next = await deliver({ kind: "PROMPT", prompt_number: 2 });
      setSecondPrompt(next);
    }
    setPhase("second");
    setBusy(false);
  }

  if (disabled) {
    return null;
  }

  if (phase === "closed") {
    return (
      <p className="mt-5 text-sm leading-6 text-[#5C6B74]" role="status">
        Answer the question below when you are ready.
      </p>
    );
  }

  return (
    <section className={panelClass} aria-labelledby={`${firstId}-heading`}>
      <h2
        id={`${firstId}-heading`}
        className="text-base font-semibold text-[#163A59]"
      >
        Before you answer (optional)
      </h2>
      <p className="mt-2 text-base leading-7 whitespace-pre-wrap text-[#24313A]">
        {interview.primary_prompt}
      </p>
      {phase === "first" ? (
        <>
          <label
            htmlFor={firstId}
            className="mt-4 block text-sm leading-6 text-[#24313A]"
          >
            {interview.commitment_prompt || DEFAULT_COMMITMENT}
          </label>
          <textarea
            id={firstId}
            value={firstNotes}
            onChange={(event) => setFirstNotes(event.target.value)}
            className={textareaClass}
            disabled={busy}
          />
          <p className="mt-2 text-sm leading-6 text-[#5C6B74]">
            Your notes stay on this page. They are not saved or scored.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className={primaryButtonClass}
              disabled={busy || firstNotes.trim() === ""}
              onClick={() => {
                void continueFirst();
              }}
            >
              Continue
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() => setPhase("closed")}
            >
              Skip this step
            </button>
          </div>
        </>
      ) : (
        <>
          <div aria-live="polite">
            {feedback ? (
              <p className="mt-4 text-base leading-7 whitespace-pre-wrap text-[#24313A]">
                {feedback}
              </p>
            ) : null}
          </div>
          {secondPrompt ? (
            <>
              <p className="mt-4 text-base leading-7 whitespace-pre-wrap text-[#24313A]">
                {secondPrompt}
              </p>
              <label
                htmlFor={secondId}
                className="mt-4 block text-sm leading-6 text-[#24313A]"
              >
                {interview.commitment_prompt || DEFAULT_COMMITMENT}
              </label>
              <textarea
                id={secondId}
                value={secondNotes}
                onChange={(event) => setSecondNotes(event.target.value)}
                className={textareaClass}
              />
            </>
          ) : null}
          <div className="mt-4">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setPhase("closed")}
            >
              Return to the question
            </button>
          </div>
        </>
      )}
      {error ? (
        <p className="mt-4 text-base leading-7 text-[#24313A]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
