import type { Metadata } from "next";
import { LearnerRegisterForm } from "@/components/LearnerRegisterForm";

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
        Enter your name, email, and password. We email an 8-digit code to
        confirm the address. If that email matches an unclaimed subscription,
        we link it to this account. Payment stays on Shopify.
      </p>
      <LearnerRegisterForm />
    </main>
  );
}
