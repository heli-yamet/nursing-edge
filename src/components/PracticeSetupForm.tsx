"use client";

import { useState } from "react";
import { LEARNER_TOPICS } from "@/lib/learner-topics";
import {
  ALL_TOPICS,
  DEFAULT_PRACTICE_SIZE,
  INSUFFICIENT_SUPPLY_MESSAGE,
  PRACTICE_SIZES,
  sizeIsAvailable,
  type PracticeScope,
  type PracticeSize,
  type PracticeSupply,
} from "@/lib/practice-options";

const SCOPES: { id: PracticeScope; label: string }[] = [
  { id: ALL_TOPICS, label: "All Topics" },
  ...LEARNER_TOPICS.map((topic) => ({ id: topic.topic_id, label: topic.name })),
];

const optionClass =
  "flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[10px] border border-[#D9E1E5] bg-white px-4 text-base text-[#24313A] has-[:checked]:border-[#0B7F86] has-[:checked]:bg-[#E8F5F5] has-[:checked]:font-medium has-[:checked]:text-[#163A59] has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-[#F7F9FA] has-[:disabled]:text-[#66727A] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#0B7F86]";

export function PracticeSetupForm({ supply }: { supply: PracticeSupply }) {
  const [scope, setScope] = useState<PracticeScope>(ALL_TOPICS);
  const [size, setSize] = useState<PracticeSize | null>(DEFAULT_PRACTICE_SIZE);

  const available = PRACTICE_SIZES.filter((option) =>
    sizeIsAvailable(supply[scope], option),
  );
  const selectedSize = size !== null && available.includes(size) ? size : null;
  const someUnavailable = available.length < PRACTICE_SIZES.length;

  return (
    <form className="mt-8" onSubmit={(event) => event.preventDefault()}>
      <fieldset>
        <legend className="text-xl font-semibold text-[#163A59]">
          Select Scope
        </legend>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {SCOPES.map((option) => (
            <label key={option.id} className={optionClass}>
              <input
                type="radio"
                name="scope"
                value={option.id}
                checked={scope === option.id}
                onChange={() => setScope(option.id)}
                className="h-5 w-5 accent-[#0B7F86]"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="text-xl font-semibold text-[#163A59]">
          Select Size
        </legend>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {PRACTICE_SIZES.map((option) => {
            const disabled = !available.includes(option);
            return (
              <label key={option} className={optionClass}>
                <input
                  type="radio"
                  name="size"
                  value={option}
                  checked={selectedSize === option}
                  disabled={disabled}
                  aria-describedby={disabled ? "size-unavailable" : undefined}
                  onChange={() => setSize(option)}
                  className="h-5 w-5 accent-[#0B7F86]"
                />
                {option} Questions
              </label>
            );
          })}
        </div>
        {someUnavailable ? (
          <p
            id="size-unavailable"
            className="mt-3 text-base leading-7 text-[#24313A]"
            role="status"
          >
            {INSUFFICIENT_SUPPLY_MESSAGE}
          </p>
        ) : null}
      </fieldset>

      <div className="mt-8">
        <button
          type="submit"
          disabled
          aria-describedby="session-not-open"
          className="inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white disabled:opacity-60"
        >
          Start Session
        </button>
        <p id="session-not-open" className="mt-3 text-sm leading-6 text-[#66727A]">
          Practice sessions are not open yet. No questions are shown here.
        </p>
      </div>
    </form>
  );
}
