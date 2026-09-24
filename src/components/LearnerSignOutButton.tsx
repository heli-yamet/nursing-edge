"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LearnerSignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/learner/sign-out", { method: "POST" });
      router.push("/sign-in");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void signOut()}
      className="inline-flex min-h-[48px] items-center rounded-[10px] border border-[#D9E1E5] bg-white px-5 text-base font-medium text-[#163A59] disabled:opacity-60"
    >
      Sign out
    </button>
  );
}
