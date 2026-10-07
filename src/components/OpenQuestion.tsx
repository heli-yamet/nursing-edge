"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CONFIDENCE_CHOICES,
  applyOptionChoice,
  canSubmitAnswer,
  confidenceAfterSelectionChange,
  isValidAnswer,
} from "@/lib/answer-selection";
import type { FactualReveal } from "@/lib/factual-reveal";
import type { Confidence, QuestionFormat } from "@/lib/learner-types";
import type { PreCommitOption } from "@/lib/player-question";

const choiceClass =
  "flex min-h-[48px] cursor-pointer items-start gap-3 rounded-[10px] border border-[#D9E1E5] bg-white px-4 py-3 text-base leading-7 text-[#24313A] has-[:checked]:border-[#0B7F86] has-[:checked]:bg-[#E8F5F5] has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#0B7F86]";

const confidenceClass =
  "flex min-h-[72px] cursor-pointer items-start gap-3 rounded-[10px] border border-[#D9E1E5] bg-white px-3 py-3 text-left has-[:checked]:border-[#0B7F86] has-[:checked]:bg-[#E8F5F5] has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#0B7F86]";

const secondaryButtonClass =
  "inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] border border-[#D9E1E5] bg-white px-5 text-base font-medium text-[#163A59] hover:bg-[#F7F9FA] sm:w-auto";

const primaryButtonClass =
  "inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const SUBMIT_FAILURE =
  "Your answer was not submitted. Check your connection and try again.";

function isReveal(value: unknown): value is FactualReveal {
  if (!value || typeof value !== "object") {
    return false;
  }
  const reveal = value as FactualReveal;
  return (
    (reveal.outcome === "Correct" || reveal.outcome === "Incorrect") &&
    (reveal.confidence === "Unsure" ||
      reveal.confidence === "Sure" ||
      reveal.confidence === "Confident") &&
    typeof reveal.topic === "string" &&
    typeof reveal.learner_core_rationale === "string" &&
    Array.isArray(reveal.selection) &&
    Array.isArray(reveal.correct_options)
  );
}

function OptionList({ options }: { options: FactualReveal["selection"] }) {
  return (
    <ul className="mt-2 grid gap-2">
      {options.map((option) => (
        <li key={option.option_id} className="text-base leading-7 text-[#24313A]">
          <span className="font-medium text-[#163A59]">
            {option.displayed_option}.
          </span>{" "}
          {option.option_text}
        </li>
      ))}
    </ul>
  );
}

export function OpenQuestion({
  label,
  position,
  size,
  questionVersionId,
  stem,
  format,
  options,
}: {
  label: string;
  position: number;
  size: number;
  questionVersionId: string;
  stem: string;
  format: QuestionFormat;
  options: PreCommitOption[];
}) {
  const router = useRouter();
  const [pendingNav, startNav] = useTransition();
  const answerName = useId();
  const confidenceName = useId();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [reveal, setReveal] = useState<FactualReveal | null>(null);
  const [isLast, setIsLast] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const optionIds = options.map((option) => option.option_id);
  const answerReady = isValidAnswer(format, optionIds, selectedIds);
  const submitReady = canSubmitAnswer(
    format,
    optionIds,
    selectedIds,
    confidence,
  );
  const progress = size > 0 ? Math.round((position / size) * 100) : 0;
  const inputType = format === "MCQ" ? "radio" : "checkbox";
  const locked = reveal !== null || pending;

  function chooseOption(optionId: string) {
    if (locked) {
      return;
    }
    const nextIds = applyOptionChoice(format, selectedIds, optionId);
    setSelectedIds(nextIds);
    setConfidence(
      confidenceAfterSelectionChange(selectedIds, nextIds, confidence),
    );
  }

  async function submitAnswer() {
    if (!submitReady || !confidence || locked) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/learner/sessions/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          position,
          question_version_id: questionVersionId,
          selected_option_ids: selectedIds,
          confidence,
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        reveal?: unknown;
        is_last?: unknown;
      };
      if (!response.ok || !body.ok || !isReveal(body.reveal)) {
        setError(SUBMIT_FAILURE);
        return;
      }
      setReveal(body.reveal);
      setIsLast(body.is_last === true);
    } catch {
      setError(SUBMIT_FAILURE);
    } finally {
      setPending(false);
    }
  }

  function advance() {
    startNav(() => {
      router.refresh();
    });
  }

  return (
    <article aria-labelledby="open-question-heading">
      <h1
        id="open-question-heading"
        className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]"
      >
        {label}
      </h1>
      <p className="mt-2 text-base font-medium text-[#163A59]">
        Question {position} of {size}
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-[#E6EEF0]"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={size}
        aria-valuenow={position}
        aria-valuetext={`Question ${position} of ${size}`}
        aria-label="Session progress"
      >
        <div className="h-full bg-[#0B7F86]" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-5 text-base leading-7 whitespace-pre-wrap text-[#24313A]">
        {stem}
      </p>
      <fieldset className="mt-4" disabled={locked}>
        <legend className="sr-only">
          {format === "MCQ" ? "Select one answer" : "Select all that apply"}
        </legend>
        <div className="grid gap-2">
          {options.map((option) => (
            <label key={option.option_id} className={choiceClass}>
              <input
                type={inputType}
                name={answerName}
                value={option.option_id}
                checked={selectedIds.includes(option.option_id)}
                onChange={() => chooseOption(option.option_id)}
                className="mt-1 h-5 w-5 accent-[#0B7F86]"
              />
              <span>
                <span className="font-medium text-[#163A59]">
                  {option.displayed_option}.
                </span>{" "}
                {option.option_text}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {answerReady && !reveal ? (
        <fieldset className="mt-5" disabled={pending}>
          <legend className="text-xl font-semibold text-[#163A59]">
            How certain are you about your answer?
          </legend>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {CONFIDENCE_CHOICES.map((choice) => (
              <label key={choice.value} className={confidenceClass}>
                <input
                  type="radio"
                  name={confidenceName}
                  value={choice.value}
                  checked={confidence === choice.value}
                  onChange={() => setConfidence(choice.value)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[#0B7F86]"
                />
                <span>
                  <span className="block font-medium text-[#163A59]">
                    {choice.label}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-[#24313A]">
                    {choice.meaning}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {reveal ? (
        <section className="mt-5" aria-live="polite">
          <h2 className="text-xl font-semibold text-[#163A59]">{reveal.outcome}</h2>
          <h3 className="mt-4 text-base font-semibold text-[#163A59]">
            Your answer
          </h3>
          <OptionList options={reveal.selection} />
          <h3 className="mt-4 text-base font-semibold text-[#163A59]">
            Correct answer
          </h3>
          <OptionList options={reveal.correct_options} />
          <p className="mt-4 text-base leading-7 text-[#24313A]">
            <span className="font-medium text-[#163A59]">Confidence: </span>
            {reveal.confidence}
          </p>
          <p className="mt-2 text-base leading-7 text-[#24313A]">
            <span className="font-medium text-[#163A59]">Topic: </span>
            {reveal.topic}
          </p>
          <h3 className="mt-4 text-base font-semibold text-[#163A59]">
            Rationale
          </h3>
          <p className="mt-2 text-base leading-7 whitespace-pre-wrap text-[#24313A]">
            {reveal.learner_core_rationale}
          </p>
        </section>
      ) : null}
      {error ? (
        <p className="mt-6 text-base leading-7 text-[#24313A]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/home" className={secondaryButtonClass}>
          Save and Exit
        </Link>
        {reveal ? (
          <button
            type="button"
            onClick={advance}
            disabled={pendingNav}
            className={primaryButtonClass}
          >
            {isLast ? "View Results" : "Next Question"}
          </button>
        ) : (
          <button
            type="button"
            disabled={!submitReady || pending}
            onClick={() => {
              void submitAnswer();
            }}
            className={primaryButtonClass}
          >
            Submit Answer
          </button>
        )}
      </div>
    </article>
  );
}
