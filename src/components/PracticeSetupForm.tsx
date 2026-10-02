"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LEARNER_TOPICS } from "@/lib/learner-topics";
import {
  ALL_TOPICS,
  DEFAULT_PRACTICE_SIZE,
  INSUFFICIENT_SUPPLY_MESSAGE,
  PRACTICE_SIZES,
  practiceScopeLabel,
  sizeIsAvailable,
  type PracticeScope,
  type PracticeSize,
  type PracticeSupply,
} from "@/lib/practice-options";

const SCOPE_IDS: PracticeScope[] = [
  ALL_TOPICS,
  ...LEARNER_TOPICS.map((topic) => topic.topic_id),
];
const SCOPES = SCOPE_IDS.map((id) => ({ id, label: practiceScopeLabel(id) }));

type StartResponse = {
  result?: string;
  reason?: string;
  error?: string;
};

function startErrorMessage(status: number, payload: StartResponse): string {
  if (payload.result === "insufficient_supply") {
    return payload.reason ?? INSUFFICIENT_SUPPLY_MESSAGE;
  }
  if (status === 401) {
    return "Your sign-in has expired. Sign in again to start a session.";
  }
  if (payload.result === "access_unavailable") {
    return "Your access is not active right now. Check your subscription on the Account page.";
  }
  return "The session could not be started. Try again.";
}

const optionClass =
  "flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[10px] border border-[#D9E1E5] bg-white px-4 text-base text-[#24313A] has-[:checked]:border-[#0B7F86] has-[:checked]:bg-[#E8F5F5] has-[:checked]:font-medium has-[:checked]:text-[#163A59] has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-[#F7F9FA] has-[:disabled]:text-[#66727A] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#0B7F86]";

export function PracticeSetupForm({ supply }: { supply: PracticeSupply }) {
  const [scope, setScope] = useState<PracticeScope>(ALL_TOPICS);
  const [size, setSize] = useState<PracticeSize | null>(DEFAULT_PRACTICE_SIZE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const available = PRACTICE_SIZES.filter((option) =>
    sizeIsAvailable(supply[scope], option),
  );
  const selectedSize = size !== null && available.includes(size) ? size : null;
  const someUnavailable = available.length < PRACTICE_SIZES.length;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || selectedSize === null) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/learner/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, size: selectedSize }),
      });
      const payload = (await response.json().catch(() => ({}))) as StartResponse;
      if (
        response.status === 201 ||
        payload.result === "created" ||
        payload.result === "already_active"
      ) {
        router.refresh();
        return;
      }
      setError(startErrorMessage(response.status, payload));
      setBusy(false);
    } catch {
      setError("Could not reach the server. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className="mt-8" onSubmit={(event) => void onSubmit(event)}>
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
          disabled={busy || selectedSize === null}
          aria-busy={busy}
          className="inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C] disabled:opacity-60"
        >
          {busy ? "Starting…" : "Start Session"}
        </button>
        {error ? (
          <p className="mt-3 text-base leading-7 text-[#9B2C2C]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
