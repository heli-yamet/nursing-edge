"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BaselineChoice() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function chooseTopic() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/learner/calibration/decline", {
        method: "POST",
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (data.error === "access_unavailable") {
        router.push("/account");
        router.refresh();
        return;
      }
      if (!response.ok || !data.ok) {
        setMessage("Could not save your choice. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setMessage("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col items-start gap-3">
      <button
        type="button"
        disabled
        aria-describedby="baseline-not-open"
        className="inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white disabled:opacity-60"
      >
        Start with My Baseline — Recommended
      </button>
      <p id="baseline-not-open" className="text-sm leading-6 text-[#66727A]">
        Baseline sessions are not open yet. No questions are shown here.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void chooseTopic()}
        className="mt-2 inline-flex min-h-[48px] items-center rounded-[10px] border border-[#0B7F86] bg-white px-5 text-base font-medium text-[#0B7F86] hover:bg-[#F7F9FA] disabled:opacity-60"
      >
        {busy ? "Saving…" : "Choose a Topic Instead"}
      </button>
      {message ? (
        <p className="text-base leading-7 text-[#9B2C2C]" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
