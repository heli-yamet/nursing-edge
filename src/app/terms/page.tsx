import type { Metadata } from "next";
import { AcceptTermsForm } from "@/components/AcceptTermsForm";
import { requireEntryStep } from "@/lib/learner-gate";

export const metadata: Metadata = {
  title: "Terms and Privacy",
};

export const dynamic = "force-dynamic";

export default async function TermsPage() {
  await requireEntryStep("terms");

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-5 py-16 sm:px-6">
      <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Terms and Privacy
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
        Nursing Edge requires acceptance of the current Terms and Privacy
        Notice before you continue. Acceptance is stored with the time you
        accept. There is no skip.
      </p>
      <AcceptTermsForm />
    </main>
  );
}
