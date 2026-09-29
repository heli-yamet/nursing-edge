"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ResetResponse = {
  result:
    | "unknown"
    | "code_sent"
    | "wait"
    | "code"
    | "success"
    | "invalid_request"
    | "error";
  rateLimited?: boolean;
};

function isEightDigits(value: string): boolean {
  return /^\d{8}$/.test(value);
}

export function LearnerResetPasswordForm() {
  const [step, setStep] = useState<"email" | "reset" | "done">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "error">("error");
  const [busy, setBusy] = useState(false);
  const [sendWait, setSendWait] = useState(0);
  const [tryWait, setTryWait] = useState(0);

  useEffect(() => {
    if (sendWait <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setSendWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [sendWait]);

  useEffect(() => {
    if (tryWait <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setTryWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [tryWait]);

  const resetEnabled = useMemo(
    () =>
      isEightDigits(code) && password.length >= 8 && tryWait === 0 && !busy,
    [busy, code, password.length, tryWait],
  );

  function show(text: string, tone: "info" | "error") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function requestCode() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/learner/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as ResetResponse;
      if (!response.ok) {
        show("Could not send the code. Try again.", "error");
        return;
      }
      if (data.result === "unknown") {
        show("No Nursing Edge account uses that email.", "error");
        return;
      }
      if (data.result === "wait") {
        setStep("reset");
        setSendWait(60);
        show("Please wait 1 minute before sending another code.", "error");
        return;
      }
      if (data.result === "code_sent") {
        setStep("reset");
        setSendWait(60);
        show("We sent an 8-digit code to your email.", "info");
        return;
      }
      show("Could not send the code. Try again.", "error");
    } catch {
      show("Could not reach the server. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!resetEnabled) {
      return;
    }
    setBusy(true);
    setMessage("");
    setTryWait(3);
    try {
      const response = await fetch("/api/learner/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code }),
      });
      const data = (await response.json()) as ResetResponse;
      if (data.rateLimited) {
        show("Try again in 3 seconds.", "error");
        return;
      }
      if (data.result === "unknown") {
        show("No Nursing Edge account uses that email.", "error");
        return;
      }
      if (data.result === "code") {
        show("That code does not match. Try again.", "error");
        return;
      }
      if (data.result === "success") {
        setStep("done");
        show("Your password is updated. Sign in with the new password.", "info");
        return;
      }
      show("Could not reset the password. Try again.", "error");
    } catch {
      show("Could not reach the server. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "mt-2 min-h-[48px] w-full rounded-[10px] border border-[#D9E1E5] bg-white px-3 text-base text-[#24313A] read-only:bg-[#F7F9FA]";

  if (step === "done") {
    return (
      <div className="mt-8 space-y-5">
        <p className="text-sm leading-6 text-[#163A59]" role="status">
          {message}
        </p>
        <Link
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C]"
          href="/sign-in"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (step === "email") {
          void requestCode();
        } else {
          void resetPassword();
        }
      }}
    >
      <label className="block">
        <span className="text-sm font-medium text-[#163A59]">Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          readOnly={step === "reset"}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
        />
      </label>
      {step === "reset" ? (
        <>
          <label className="block">
            <span className="text-sm font-medium text-[#163A59]">
              8-digit code
            </span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 8))
              }
              className="mt-2 min-h-[48px] w-full rounded-[10px] border border-[#D9E1E5] bg-white px-3 text-base tracking-[0.3em] text-[#24313A]"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[#163A59]">
              New password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass}
            />
          </label>
        </>
      ) : null}
      {message ? (
        <p
          className={
            messageTone === "info"
              ? "text-sm leading-6 text-[#163A59]"
              : "text-sm leading-6 text-[#B84A4A]"
          }
          role={messageTone === "info" ? "status" : "alert"}
        >
          {message}
        </p>
      ) : null}
      {step === "email" ? (
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C] disabled:opacity-60"
        >
          Send code
        </button>
      ) : (
        <div className="space-y-3">
          <button
            type="submit"
            disabled={!resetEnabled}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C] disabled:opacity-60"
          >
            {tryWait > 0 ? `Try ${tryWait}s later` : "Reset password"}
          </button>
          <button
            type="button"
            disabled={busy || sendWait > 0}
            onClick={() => void requestCode()}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] border border-[#D9E1E5] bg-white px-5 text-base font-medium text-[#163A59] disabled:opacity-60"
          >
            {sendWait > 0
              ? `Wait ${sendWait}s to send code again`
              : "Send code again"}
          </button>
        </div>
      )}
      <p className="text-sm text-[#66727A]">
        Remember your password?{" "}
        <Link className="text-[#0B7F86] underline" href="/sign-in">
          Sign in
        </Link>
      </p>
    </form>
  );
}
