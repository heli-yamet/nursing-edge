"use client";

import { entryDestination } from "@/lib/learner-entry";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptTermsForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function accept() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/learner/terms", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; next?: string };
      if (!response.ok || !data.ok) {
        setMessage("Could not record acceptance. Try again.");
        return;
      }
      router.push(entryDestination(data.next));
      router.refresh();
    } catch {
      setMessage("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        disabled={busy}
        onClick={() => void accept()}
        className="inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C] disabled:opacity-60"
      >
        {busy ? "Saving…" : "I accept"}
      </button>
      {message ? (
        <p className="mt-4 text-base leading-7 text-[#9B2C2C]" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
