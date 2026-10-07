import type { ReactNode } from "react";
import { LearnerNav, type LearnerNavItem } from "@/components/LearnerNav";

export function LearnerShell({
  current,
  children,
  wide = false,
}: {
  current: LearnerNavItem;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <>
      <LearnerNav current={current} wide={wide} />
      <main
        className={`mx-auto flex w-full flex-1 flex-col px-5 sm:px-6 ${
          wide
            ? "max-w-[1024px] pt-6 pb-12"
            : "max-w-[760px] pt-10 pb-16"
        }`}
      >
        {children}
      </main>
    </>
  );
}
