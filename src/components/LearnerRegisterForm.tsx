"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CheckResponse = {
  check: boolean;
  code: boolean | null;
  reason?: "exists" | "unpaid" | "paid" | "granted" | null;
};

type RegisterResponse = {
  result: "exists" | "unpaid" | "code" | "success" | "invalid_request" | "error";
  rateLimited?: boolean;
  access?: boolean;
};

const PURCHASE_FIRST =
  "Purchase a Nursing Edge plan before creating an account.";

function isEightDigits(value: string): boolean {
  return /^\d{8}$/.test(value);
}

export function LearnerRegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [firstName, setFirstName] = useState("");
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

  const verifyEnabled = useMemo(
    () => isEightDigits(code) && tryWait === 0 && !busy,
    [busy, code, tryWait],
  );

  function show(text: string, tone: "info" | "error") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function requestCode() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/learner/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, method: "signup" }),
      });
      const data = (await response.json()) as CheckResponse;

      if (!response.ok) {
        show("Could not send the code. Try again.", "error");
        return;
      }

      if (!data.check) {
        show(
          data.reason === "unpaid"
            ? PURCHASE_FIRST
            : "This email already has an account. Sign in instead.",
          "error",
        );
        return;
      }

      if (data.code === false) {
        setSendWait(60);
        show("Please wait 1 minute before sending another code.", "error");
        return;
      }

      setStep("code");
      setSendWait(60);
      show("We sent an 8-digit code to your email.", "info");
    } catch {
      show("Could not reach the server. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!verifyEnabled) {
      return;
    }
    setBusy(true);
    setMessage("");
    setTryWait(3);
    try {
      const response = await fetch("/api/learner/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, email, password, code }),
      });
      const data = (await response.json()) as RegisterResponse;
      if (data.rateLimited) {
        show("Try again in 3 seconds.", "error");
        return;
      }
      if (data.result === "exists") {
        show("This email already has an account. Sign in instead.", "error");
        return;
      }
      if (data.result === "unpaid") {
        show(PURCHASE_FIRST, "error");
        return;
      }
      if (data.result === "code") {
        show("That code does not match. Try again.", "error");
        return;
      }
      if (data.result === "success") {
        router.push("/account");
        router.refresh();
        return;
      }
      show("Could not create the account. Try again.", "error");
    } catch {
      show("Could not reach the server. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  const locked = step === "code";
  const fieldClass =
    "mt-2 min-h-[48px] w-full rounded-[10px] border border-[#D9E1E5] bg-white px-3 text-base text-[#24313A] read-only:bg-[#F7F9FA]";

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (step === "credentials") {
          void requestCode();
        } else {
          void verify();
        }
      }}
    >
      <label className="block">
        <span className="text-sm font-medium text-[#163A59]">First name</span>
        <input
          type="text"
          autoComplete="given-name"
          required
          maxLength={80}
          readOnly={locked}
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-[#163A59]">Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          readOnly={locked}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-[#163A59]">Password</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          readOnly={locked}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
        />
      </label>

      {step === "code" ? (
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

      {step === "credentials" ? (
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C] disabled:opacity-60"
        >
          Create account
        </button>
      ) : (
        <div className="space-y-3">
          <button
            type="submit"
            disabled={!verifyEnabled}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C] disabled:opacity-60"
          >
            {tryWait > 0 ? `Try ${tryWait}s later` : "Verify email"}
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
        Already have an account?{" "}
        <Link className="text-[#0B7F86] underline" href="/sign-in">
          Sign in
        </Link>
      </p>
    </form>
  );
}
