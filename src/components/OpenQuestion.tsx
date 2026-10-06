"use client";

import { useId, useState } from "react";
import {
  CONFIDENCE_CHOICES,
  applyOptionChoice,
  canSubmitAnswer,
  confidenceAfterSelectionChange,
  isValidAnswer,
} from "@/lib/answer-selection";
import type { Confidence, QuestionFormat } from "@/lib/learner-types";
import type { PreCommitOption } from "@/lib/player-question";

const choiceClass =
  "flex min-h-[48px] cursor-pointer items-start gap-3 rounded-[10px] border border-[#D9E1E5] bg-white px-4 py-3 text-base leading-7 text-[#24313A] has-[:checked]:border-[#0B7F86] has-[:checked]:bg-[#E8F5F5] has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#0B7F86]";

export function OpenQuestion({
  label,
  position,
  size,
  stem,
  format,
  options,
}: {
  label: string;
  position: number;
  size: number;
  stem: string;
  format: QuestionFormat;
  options: PreCommitOption[];
}) {
  const answerName = useId();
  const confidenceName = useId();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
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

  function chooseOption(optionId: string) {
    const nextIds = applyOptionChoice(format, selectedIds, optionId);
    setSelectedIds(nextIds);
    setConfidence(
      confidenceAfterSelectionChange(selectedIds, nextIds, confidence),
    );
  }

  return (
    <article aria-labelledby="open-question-heading">
      <h1
        id="open-question-heading"
        className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]"
      >
        {label}
      </h1>
      <p className="mt-4 text-base font-medium text-[#163A59]">
        Question {position} of {size}
      </p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-[#E6EEF0]"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={size}
        aria-valuenow={position}
        aria-valuetext={`Question ${position} of ${size}`}
        aria-label="Session progress"
      >
        <div className="h-full bg-[#0B7F86]" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-8 text-base leading-7 whitespace-pre-wrap text-[#24313A]">
        {stem}
      </p>
      <fieldset className="mt-6">
        <legend className="text-xl font-semibold text-[#163A59]">
          {format === "MCQ" ? "Select one answer" : "Select all that apply"}
        </legend>
        <div className="mt-4 grid gap-3">
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
      {answerReady ? (
        <fieldset className="mt-8">
          <legend className="text-xl font-semibold text-[#163A59]">
            How certain are you about your answer?
          </legend>
          <div className="mt-4 grid gap-3">
            {CONFIDENCE_CHOICES.map((choice) => (
              <label key={choice.value} className={choiceClass}>
                <input
                  type="radio"
                  name={confidenceName}
                  value={choice.value}
                  checked={confidence === choice.value}
                  onChange={() => setConfidence(choice.value)}
                  className="mt-1 h-5 w-5 accent-[#0B7F86]"
                />
                <span>
                  <span className="block font-medium text-[#163A59]">
                    {choice.label}
                  </span>
                  <span className="mt-1 block text-sm leading-6">
                    {choice.meaning}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="mt-8">
        <button
          type="button"
          disabled={!submitReady}
          className="inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C] disabled:opacity-60"
        >
          Submit Answer
        </button>
      </div>
    </article>
  );
}
