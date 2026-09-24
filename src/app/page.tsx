import Link from "next/link";
import { STATUS_SITE_URL } from "@/lib/site";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-5 py-16 sm:px-6">
      <h1 className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]">
        Nursing Edge
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#24313A]">
        Practice, Review, and Progress will live here. The learner app is in
        progress.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/sign-in"
          className="inline-flex min-h-[48px] items-center rounded-[10px] bg-[#0B7F86] px-5 text-base font-medium text-white hover:bg-[#08666C]"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="inline-flex min-h-[48px] items-center rounded-[10px] border border-[#D9E1E5] bg-white px-5 text-base font-medium text-[#163A59]"
        >
          Create account
        </Link>
      </div>
      {STATUS_SITE_URL ? (
        <p className="mt-6">
          <a
            href={STATUS_SITE_URL}
            className="text-base font-medium text-[#0B7F86] underline"
          >
            View status and changelog
          </a>
        </p>
      ) : null}
    </main>
  );
}
