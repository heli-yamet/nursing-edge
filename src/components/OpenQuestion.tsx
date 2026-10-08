"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CONFIDENCE_CHOICES,
  applyOptionChoice,
  canSubmitAnswer,
  confidenceAfterSelectionChange,
  isValidAnswer,
  sameAnswer,
} from "@/lib/answer-selection";
import { EMPTY_DEEPER, type FactualReveal } from "@/lib/factual-reveal";
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
const DRAFT_FAILURE =
  "Your current selections have not been saved yet. Stay on this page or try again before leaving.";
const ELSEWHERE =
  "This session was updated elsewhere. We restored your latest saved progress.";

const CONFIDENCE_FROM_WORD: Record<FactualReveal["confidence"], Confidence> = {
  Unsure: "UNSURE",
  Sure: "SURE",
  Confident: "CONFIDENT",
};

function matchesSubmitted(
  reveal: FactualReveal,
  selectedIds: readonly string[],
  confidence: Confidence,
): boolean {
  return (
    sameAnswer(
      reveal.selection.map((option) => option.option_id),
      selectedIds,
    ) && reveal.confidence === confidenceWord(confidence)
  );
}

function confidenceWord(confidence: Confidence): FactualReveal["confidence"] {
  if (confidence === "UNSURE") {
    return "Unsure";
  }
  if (confidence === "SURE") {
    return "Sure";
  }
  return "Confident";
}

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

function ResultCard({ reveal }: { reveal: FactualReveal }) {
  const [open, setOpen] = useState(false);
  const correct = reveal.outcome === "Correct";
  const deeper = reveal.deeper ?? EMPTY_DEEPER;
  const deeperParts = [
    ["Why it wins", deeper.why_it_wins],
    ["The trap", deeper.the_trap],
    ["Carry it forward", deeper.carry_it_forward],
    ["A closer look", deeper.concise_teaching_response],
  ].filter((part): part is [string, string] => part[1].trim().length > 0);

  return (
    <section
      className="mt-5 overflow-hidden rounded-[16px] border border-[#D9E1E5] bg-white"
      aria-live="polite"
    >
      <div
        className={`flex items-center gap-3 px-5 py-4 ${
          correct ? "bg-[#E7F6EE]" : "bg-[#FDECEC]"
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${
            correct ? "bg-[#1E9B57]" : "bg-[#D14343]"
          }`}
        >
          {correct ? <CheckMark /> : <CloseMark />}
        </span>
        <h2 className="text-xl font-semibold text-[#163A59]">{reveal.outcome}</h2>
      </div>
      <div className="px-5 py-5">
        <p className="text-xs font-semibold tracking-[0.14em] text-[#66727A] uppercase">
          Correct answer
        </p>
        <ul className="mt-2 grid gap-2">
          {reveal.correct_options.map((option) => (
            <li
              key={option.option_id}
              className="text-lg leading-7 font-semibold text-[#163A59]"
            >
              {option.displayed_option}. {option.option_text}
            </li>
          ))}
        </ul>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#F3F6F4] px-3 py-1.5 text-sm text-[#24313A]">
          <SignalMark />
          <span>
            <span className="font-semibold text-[#163A59]">Confidence:</span>{" "}
            {reveal.confidence}
          </span>
        </p>
      </div>
      <div className="border-t border-[#E6EEF0] px-5 py-5">
        <h3 className="text-base font-semibold text-[#163A59]">
          {correct ? "Why this is correct" : "Why this is incorrect"}
        </h3>
        <p className="mt-2 text-base leading-7 whitespace-pre-wrap text-[#24313A]">
          {reveal.learner_core_rationale}
        </p>
        <p className="mt-3 text-sm leading-6 text-[#5C6B74]">
          <span className="font-semibold text-[#163A59]">Topic: </span>
          {reveal.topic}
        </p>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#0B7F86]"
        >
          <ChevronMark open={open} />
          See deeper explanation
        </button>
        {open ? (
          <div className="mt-3 grid gap-3">
            {deeperParts.length > 0 ? (
              deeperParts.map(([label, text]) => (
                <p key={label} className="text-sm leading-6 text-[#24313A]">
                  <span className="font-semibold text-[#163A59]">{label}. </span>
                  {text}
                </p>
              ))
            ) : (
              <p className="text-sm leading-6 text-[#5C6B74]">
                No further explanation is available for this question.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M6 12.5 10 16.5 18 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M7 7 17 17M17 7 7 17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SignalMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#0B7F86]" aria-hidden="true">
      <path
        d="M5 16.5v-2.2M9.2 16.5V11M13.4 16.5V8.2M17.6 16.5V5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronMark({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path
        d="M6 9.5 12 15.5 18 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
  initialSelectedIds = [],
  initialConfidence = null,
  initialReveal = null,
  initialIsLast = false,
}: {
  label: string;
  position: number;
  size: number;
  questionVersionId: string;
  stem: string;
  format: QuestionFormat;
  options: PreCommitOption[];
  initialSelectedIds?: string[];
  initialConfidence?: Confidence | null;
  initialReveal?: FactualReveal | null;
  initialIsLast?: boolean;
}) {
  const router = useRouter();
  const [pendingNav, startNav] = useTransition();
  const answerName = useId();
  const confidenceName = useId();
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [confidence, setConfidence] = useState<Confidence | null>(initialConfidence);
  const [reveal, setReveal] = useState<FactualReveal | null>(initialReveal);
  const [isLast, setIsLast] = useState(initialIsLast);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const revealRef = useRef(initialReveal);
  const skipSave = useRef(true);
  revealRef.current = reveal;
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

  useEffect(() => {
    if (reveal || pending) {
      return;
    }
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void persistDraft();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [selectedIds, confidence, reveal, pending]);

  function applyStored(next: FactualReveal, submittedConfidence: Confidence | null) {
    const changed =
      submittedConfidence === null ||
      !matchesSubmitted(next, selectedIds, submittedConfidence);
    setReveal(next);
    setSelectedIds(next.selection.map((option) => option.option_id));
    setConfidence(CONFIDENCE_FROM_WORD[next.confidence]);
    setNotice(changed ? ELSEWHERE : null);
  }

  async function persistDraft(): Promise<"saved" | "committed" | "failed"> {
    try {
      const response = await fetch("/api/learner/sessions/draft", {
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
        result?: string;
        reveal?: unknown;
        is_last?: unknown;
      };
      if (body.result === "saved") {
        setError(null);
        return "saved";
      }
      if (body.result === "committed" && isReveal(body.reveal)) {
        if (!revealRef.current) {
          applyStored(body.reveal, confidence);
          setIsLast(body.is_last === true);
        }
        return "committed";
      }
      setError(DRAFT_FAILURE);
      return "failed";
    } catch {
      setError(DRAFT_FAILURE);
      return "failed";
    }
  }

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
        result?: string;
        reveal?: unknown;
        is_last?: unknown;
      };
      if (!response.ok || !body.ok || !isReveal(body.reveal)) {
        setError(SUBMIT_FAILURE);
        return;
      }
      const changed =
        body.result === "replay" &&
        !matchesSubmitted(body.reveal, selectedIds, confidence);
      setReveal(body.reveal);
      setIsLast(body.is_last === true);
      setNotice(changed ? ELSEWHERE : null);
      if (changed) {
        setSelectedIds(body.reveal.selection.map((option) => option.option_id));
        setConfidence(CONFIDENCE_FROM_WORD[body.reveal.confidence]);
      }
    } catch {
      setError(SUBMIT_FAILURE);
    } finally {
      setPending(false);
    }
  }

  function advance() {
    startNav(() => {
      void fetch("/api/learner/sessions/advance", { method: "POST" }).finally(
        () => {
          router.refresh();
        },
      );
    });
  }

  async function exitWithDraft() {
    const saved = await persistDraft();
    if (saved === "saved") {
      router.push("/home");
    }
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
      {reveal ? <ResultCard reveal={reveal} /> : null}
      {notice ? (
        <p className="mt-5 text-base leading-7 text-[#24313A]" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-6 text-base leading-7 text-[#24313A]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/home"
          className={secondaryButtonClass}
          onClick={(event) => {
            if (reveal) {
              return;
            }
            event.preventDefault();
            void exitWithDraft();
          }}
        >
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
