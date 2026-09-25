import type { Metadata } from "next";
import { LearnerNav } from "@/components/LearnerNav";
import { LearnerSignOutButton } from "@/components/LearnerSignOutButton";
import { requireEntryStep } from "@/lib/learner-gate";
import { linkAndReadAccess } from "@/lib/learner-auth";

export const metadata: Metadata = {
  title: "Account",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const learner = await requireEntryStep("app");
  const access = await linkAndReadAccess(learner);

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-5 py-16 sm:px-6">
      <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Hello, {learner.first_name}
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
        Signed in as {learner.email}.
      </p>
      {access ? (
        <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
          Your Nursing Edge access is active.
        </p>
      ) : (
        <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
          No subscription is linked to this email yet. If you paid with a
          different email, support can link the purchase using your Shopify
          customer id.
        </p>
      )}
      <LearnerNav current="account" />
      <div className="mt-8">
        <LearnerSignOutButton />
      </div>
    </main>
  );
}
