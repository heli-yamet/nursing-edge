import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { HOME_ACTIONS } from "@/lib/session-rules";
import type { SessionType } from "@/lib/learner-types";

export type HomeSessionCard = {
  type: SessionType;
  size: number;
  submitted: number;
};

const SESSION_KIND: Record<SessionType, string> = {
  PRACTICE: "practice",
  CALIBRATION: "baseline",
  REVIEW: "review",
};

function continueHref(type: SessionType): string {
  if (type === "REVIEW") {
    return HOME_ACTIONS.review.href;
  }
  return "/practice/session";
}

export function HomeDashboard({
  firstName,
  session,
}: {
  firstName: string;
  session: HomeSessionCard | null;
}) {
  const practice = session
    ? {
        href: continueHref(session.type),
        label: HOME_ACTIONS["continue-session"].label,
      }
    : {
        href: HOME_ACTIONS["start-practice"].href,
        label: "Start Session",
      };
  const completed = session
    ? Math.min(session.submitted, session.size)
    : 0;
  const progress = session && session.size > 0 ? completed / session.size : 0;

  return (
    <div>
      <section className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl pt-8">
          <p className="text-xs font-semibold tracking-[0.16em] text-[#0B7F86] uppercase">
            Good to see you
          </p>
          <h1 className="mt-3 text-[32px] leading-tight font-semibold text-[#163A59] sm:text-[40px]">
            Welcome back, {firstName}.
          </h1>
          <p className="mt-3 max-w-md text-base leading-7 text-[#5C6B74]">
            Keep building your confidence — a little focused practice every day
            makes a big difference.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-0">
          <p className="relative z-10 max-w-[220px] pt-8 font-['Times_New_Roman',Times,serif] text-[22px] leading-snug text-[#163A59] sm:text-[24px]">
            Don&apos;t just raise<br/>the Bar,{" "}
            <span className="font-bold">BE the Bar</span>
            <span className="mt-3 block h-0.5 w-10 rounded-full bg-[#0B7F86]" />
          </p>
          <span className="block w-[300px] shrink-0 min-[480px]:-ml-[100px] sm:w-[440px]">
            <Image
              src="/images/banner.png"
              alt=""
              width={1536}
              height={1024}
              priority
              className="h-auto w-full"
              style={{ width: "100%", height: "auto" }}
            />
          </span>
        </div>
      </section>

      <section
        aria-label="Home actions"
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <Link
          href={practice.href}
          className={`group flex items-start gap-4 rounded-[20px] bg-gradient-to-br from-[#14959C] to-[#0A6A70] p-6 text-white shadow-[0_10px_28px_rgba(11,127,134,0.22)] transition hover:from-[#17A0A8] hover:to-[#0B747A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#163A59] ${
            session ? "lg:col-span-5" : "lg:col-span-4"
          }`}
        >
          <PlayMark />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold tracking-[0.16em] text-white/80 uppercase">
              Practice
            </span>
            <span className="mt-1 block text-xl font-semibold">
              {practice.label}
            </span>
            {session ? (
              <>
                <span className="mt-3 block text-sm leading-6 text-white/85">
                  In-progress · {session.size}-question{" "}
                  {SESSION_KIND[session.type]} session
                </span>
                <span className="mt-3 flex items-center gap-3">
                  <span
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={session.size}
                    aria-valuenow={completed}
                    aria-label={`${completed} of ${session.size} questions submitted`}
                  >
                    <span
                      className="block h-full rounded-full bg-white"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </span>
                  <span className="text-sm font-medium text-white/90">
                    {completed} of {session.size}
                  </span>
                </span>
              </>
            ) : null}
          </span>
          <span className="self-center">
            <ChevronMark bordered />
          </span>
        </Link>

        <div
          className={`grid h-full grid-cols-1 gap-4 lg:grid-cols-12 ${
            session ? "lg:col-span-7" : "lg:col-span-8"
          }`}
        >
          <QuietCard
            href={HOME_ACTIONS.review.href}
            eyebrow="Review"
            title={HOME_ACTIONS.review.label}
            body="Revisit missed questions and key concepts."
            icon={<BookMark />}
          />
          <QuietCard
            href={HOME_ACTIONS.progress.href}
            eyebrow="Progress"
            title={HOME_ACTIONS.progress.label}
            body="See your improvement and stay on track."
            icon={<SignalMark />}
          />
        </div>
      </section>

      <section className="mt-5 flex items-start gap-4 rounded-[20px] border border-[#D7EEEE] bg-[#F3FAFA] px-5 py-4 sm:items-center">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#E4F4F4] text-[#4BB8BC]">
          <HeartMark />
        </span>
        <span>
          <span className="block font-semibold text-[#163A59]">
            You&apos;re on the right track.
          </span>
          <span className="mt-1 block text-sm leading-6 text-[#5C6B74]">
            Each question you practice helps you grow into the confident nurse
            you&apos;re meant to be.
          </span>
        </span>
      </section>
    </div>
  );
}

function QuietCard({
  href,
  eyebrow,
  title,
  body,
  icon,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col rounded-[20px] border border-[#E3EAED] bg-white p-6 shadow-[0_8px_24px_rgba(22,58,89,0.04)] transition hover:border-[#C5DDDE] hover:shadow-[0_10px_28px_rgba(22,58,89,0.07)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B7F86] lg:col-span-6"
    >
      <span className="flex items-start justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E8F5F5] text-[#0B7F86]">
          {icon}
        </span>
        <ChevronMark />
      </span>
      <span className="mt-6 block text-xs font-semibold tracking-[0.16em] text-[#0B7F86] uppercase">
        {eyebrow}
      </span>
      <span className="mt-1 block text-xl font-semibold text-[#163A59]">
        {title}
      </span>
      <span className="mt-2 block text-sm leading-6 text-[#5C6B74]">{body}</span>
    </Link>
  );
}

function PlayMark() {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2BB8BC]">
      <svg viewBox="0 0 24 24" className="h-10 w-10 text-white" aria-hidden="true">
        <path d="M6.5 4.5v15l13-7.5-13-7.5Z" fill="currentColor" />
      </svg>
    </span>
  );
}

function ChevronMark({ bordered = false }: { bordered?: boolean }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
        bordered
          ? "border border-white bg-transparent text-white"
          : "text-[#8AA0A8]"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          d="M9 6.5 15.5 12 9 17.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function BookMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M4.5 5.5A2.5 2.5 0 0 1 7 3h4.2v15.2L7.4 16.4A2.5 2.5 0 0 0 4.5 16.7V5.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 5.5A2.5 2.5 0 0 0 17 3h-4.2v15.2l3.8-1.8a2.5 2.5 0 0 1 2.9.3V5.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SignalMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M5 16.5v-2.2M9.2 16.5V11M13.4 16.5V8.2M17.6 16.5V5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HeartMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
      <path
        d="M12 21.2 10.6 19.9C5.4 15.2 2 12.1 2 8.4 2 5.4 4.4 3 7.4 3c1.7 0 3.4.8 4.6 2.1C13.2 3.8 14.9 3 16.6 3 19.6 3 22 5.4 22 8.4c0 3.7-3.4 6.8-8.6 11.5L12 21.2Z"
        fill="currentColor"
      />
    </svg>
  );
}
