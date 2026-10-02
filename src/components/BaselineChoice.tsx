"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ChoiceResponse = { ok?: boolean; result?: string; error?: string };

export function BaselineChoice() {
  const router = useRouter();
  const [busy, setBusy] = useState<"baseline" | "topic" | null>(null);
  const [message, setMessage] = useState("");

  async function choose(
    choice: "baseline" | "topic",
    path: string,
    failure: string,
  ) {
    setBusy(choice);
    setMessage("");
    try {
      const response = await fetch(path, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as ChoiceResponse;
      if (data.error === "access_unavailable") {
        router.push("/account");
        router.refresh();
        return;
      }
      if (
        data.ok ||
        data.result === "already_active" ||
        data.result === "not_offered"
      ) {
        router.refresh();
        return;
      }
      setMessage(
        data.result === "unavailable"
          ? "The Baseline is not available right now. Choose a topic instead."
          : failure,
      );
    } catch {
      setMessage("Could not reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8 flex flex-col items-start gap-3">
      <button
        type="button"
        disabled={busy !== null}
        aria-busy={busy === "baseline"}
        onClick={() =>
          void choose(
            "baseline",
            "/api/learner/calibration/start",
            "Could not start your Baseline. Try again.",
          )
        }
        className="inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C] disabled:opacity-60"
      >
        {busy === "baseline" ? "Starting…" : "Start with My Baseline — Recommended"}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        aria-busy={busy === "topic"}
        onClick={() =>
          void choose(
            "topic",
            "/api/learner/calibration/decline",
            "Could not save your choice. Try again.",
          )
        }
        className="mt-2 inline-flex min-h-[48px] items-center rounded-[10px] border border-[#0B7F86] bg-white px-5 text-base font-medium text-[#0B7F86] hover:bg-[#F7F9FA] disabled:opacity-60"
      >
        {busy === "topic" ? "Saving…" : "Choose a Topic Instead"}
      </button>
      {message ? (
        <p className="text-base leading-7 text-[#9B2C2C]" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
