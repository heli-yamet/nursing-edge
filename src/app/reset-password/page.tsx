import type { Metadata } from "next";
import { LearnerResetPasswordForm } from "@/components/LearnerResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset password",
};

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-5 py-16 sm:px-6">
      <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Reset password
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
        Enter the email for your Nursing Edge account. We send an 8-digit code,
        then you choose a new password. This does not create an account.
      </p>
      <LearnerResetPasswordForm />
    </main>
  );
}
