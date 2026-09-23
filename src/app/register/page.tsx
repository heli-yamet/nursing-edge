import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Create account",
};

export default function RegisterPage() {
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-5 py-16 sm:px-6">
      <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Create your Nursing Edge account
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
        If you just subscribed, payment stays on Shopify. Account sign-up and
        linking that subscription come next. No password is created from a
        payment event.
      </p>
      <p className="mt-6">
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C]"
        >
          Back to Nursing Edge
        </Link>
      </p>
    </main>
  );
}
