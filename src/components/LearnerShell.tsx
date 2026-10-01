import type { ReactNode } from "react";
import { LearnerNav, type LearnerNavItem } from "@/components/LearnerNav";

export function LearnerShell({
  current,
  children,
}: {
  current: LearnerNavItem;
  children: ReactNode;
}) {
  return (
    <>
      <LearnerNav current={current} />
      <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-5 pt-10 pb-16 sm:px-6">
        {children}
      </main>
    </>
  );
}
