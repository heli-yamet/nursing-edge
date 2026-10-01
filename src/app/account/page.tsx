import type { Metadata } from "next";
import { LearnerShell } from "@/components/LearnerShell";
import { LearnerSignOutButton } from "@/components/LearnerSignOutButton";
import { readLearnerShopifyLinked } from "@/lib/learner-access";
import { requireEntryStep } from "@/lib/learner-gate";
import { linkAndReadAccess } from "@/lib/learner-auth";
import { manageSubscriptionUrlFromEnv } from "@/lib/shopify-link";

export const metadata: Metadata = {
  title: "Account",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const learner = await requireEntryStep("app");
  const access = await linkAndReadAccess(learner);
  const shopifyLinked = await readLearnerShopifyLinked(learner.learner_id);
  const manageSubscriptionUrl = shopifyLinked
    ? manageSubscriptionUrlFromEnv()
    : null;

  return (
    <LearnerShell current="account">
      <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Account
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
        Signed in as {learner.email}.
      </p>
      {access ? (
        <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
          Your Nursing Edge access is active.
        </p>
      ) : (
        <div
          role="status"
          className="mt-6 rounded-[12px] border border-[#D9E1E5] bg-[#E8F5F5] px-4 py-3 text-base leading-7 text-[#163A59]"
        >
          {shopifyLinked
            ? "Your Nursing Edge access is currently unavailable. If your access is Shopify-linked, use Manage Subscription; otherwise contact support."
            : "No subscription is linked to this email yet. If you paid with a different email, support can link the purchase using your Shopify customer id."}
        </div>
      )}
      <div className="mt-8 flex flex-wrap gap-3">
        {manageSubscriptionUrl ? (
          <a
            href={manageSubscriptionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex min-h-[48px] items-center rounded-[10px] px-5 text-base font-medium ${
              access
                ? "border border-[#0B7F86] bg-white text-[#0B7F86] hover:bg-[#F7F9FA]"
                : "bg-[#0B7F86] text-white hover:bg-[#08666C]"
            }`}
          >
            Manage Subscription
          </a>
        ) : null}
        <LearnerSignOutButton />
      </div>
    </LearnerShell>
  );
}
