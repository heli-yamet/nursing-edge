"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type StartResponse = {
  result?: string;
};

function startErrorMessage(status: number, payload: StartResponse): string {
  if (status === 401) {
    return "Your sign-in has expired. Sign in again to start Review.";
  }
  if (payload.result === "access_unavailable") {
    return "Your access is not active right now. Check your subscription on the Account page.";
  }
  if (payload.result === "other_session") {
    return "Another session is open. Finish or end it before starting Review.";
  }
  if (payload.result === "none_due") {
    return "No review questions are due right now.";
  }
  if (payload.result === "unavailable") {
    return "A review question is due, but it is temporarily unavailable.";
  }
  return "Review could not be started. Try again.";
}

export function ReviewStartButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function start() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/learner/sessions/review", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as StartResponse;
      if (payload.result === "created" || payload.result === "already_active") {
        router.refresh();
        return;
      }
      setError(startErrorMessage(response.status, payload));
      setBusy(false);
      if (payload.result === "other_session" || payload.result === "none_due") {
        router.refresh();
      }
    } catch {
      setError("Could not reach the server. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C] disabled:opacity-60"
      >
        {busy ? "Starting…" : "Start Review"}
      </button>
      {error ? (
        <p className="mt-3 text-base leading-7 text-[#9B2C2C]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
