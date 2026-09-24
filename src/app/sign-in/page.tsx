import type { Metadata } from "next";
import { LearnerSignInForm } from "@/components/LearnerSignInForm";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-5 py-16 sm:px-6">
      <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Sign in
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
        Use the email and password for your Nursing Edge account. We email an
        8-digit code to confirm it is you.
      </p>
      <LearnerSignInForm />
    </main>
  );
}
