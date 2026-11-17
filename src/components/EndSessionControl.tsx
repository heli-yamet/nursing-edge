"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { END_SESSION_CONFIRMATION } from "@/lib/end-session";
import { useDialogFocus } from "@/lib/dialog-focus";

const buttonClass =
  "inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] border border-[#D9E1E5] bg-white px-5 text-base font-medium text-[#163A59] hover:bg-[#F7F9FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B7F86] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const ELSEWHERE =
  "This session was updated elsewhere. We restored your latest saved progress.";

export function EndSessionControl({
  label,
  nextHref,
  disabled = false,
}: {
  label: "End Session" | "End Session and Start New";
  nextHref: "/practice/ended" | "/practice" | "/review/ended";
  disabled?: boolean;
}) {
  const router = useRouter();
  const titleId = useId();
  const bodyId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function closeDialog() {
    setOpen(false);
    setError("");
  }

  useDialogFocus({
    active: open,
    panelRef,
    onClose: closeDialog,
    returnFocusRef: triggerRef,
  });

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/learner/sessions/end", {
        method: "POST",
      });
      const body = (await response.json()) as { ok?: boolean; result?: string };
      if (response.ok && body.ok && body.result === "ended") {
        router.push(nextHref);
        router.refresh();
        return;
      }
      if (body.result === "no_session") {
        setError(ELSEWHERE);
        router.refresh();
        return;
      }
      setError("The session could not be ended. Try again.");
    } catch {
      setError("The session could not be ended. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={open ? "sr-only" : buttonClass}
        tabIndex={open ? -1 : undefined}
        aria-hidden={open ? true : undefined}
        disabled={disabled || busy}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? (
        <div
          ref={panelRef}
          className="w-full rounded-[10px] border border-[#D9E1E5] bg-white p-4 sm:max-w-xl"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
        >
          <h2 id={titleId} className="text-xl font-semibold text-[#163A59]">
            {label}
          </h2>
          <p id={bodyId} className="mt-2 text-base leading-7 text-[#24313A]">
            {END_SESSION_CONFIRMATION}
          </p>
          {error ? (
            <p className="mt-3 text-base leading-7 text-[#9B2C2C]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy ? "Ending…" : label}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={closeDialog}
            >
              Continue Session
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}