"use client";

import { entryDestination } from "@/lib/learner-entry";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function BeginOrientationForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function begin() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/learner/orientation", {
        method: "POST",
      });
      const data = (await response.json()) as { ok?: boolean; next?: string };
      if (!response.ok || !data.ok) {
        if (data.next === "/terms") {
          router.push("/terms");
          router.refresh();
          return;
        }
        setMessage("Could not record orientation. Try again.");
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
        onClick={() => void begin()}
        className="inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C] disabled:opacity-60"
      >
        {busy ? "Saving…" : "Begin"}
      </button>
      {message ? (
        <p className="mt-4 text-base leading-7 text-[#9B2C2C]" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
