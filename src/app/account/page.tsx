import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LearnerSignOutButton } from "@/components/LearnerSignOutButton";
import { learnerFromToken, linkAndReadAccess } from "@/lib/learner-auth";
import { readLearnerSessionToken } from "@/lib/learner-cookie";

export const metadata: Metadata = {
  title: "Account",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const token = await readLearnerSessionToken();
  const learner = await learnerFromToken(token);
  if (!learner) {
    redirect("/sign-in");
  }

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
      <div className="mt-8 flex flex-wrap gap-3">
        <LearnerSignOutButton />
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C]"
        >
          Back to Nursing Edge
        </Link>
      </div>
    </main>
  );
}
