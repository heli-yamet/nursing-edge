import type { ReactNode } from "react";
import {
  LearnerNav,
  learnerFrameClass,
  type LearnerNavItem,
} from "@/components/LearnerNav";

export function LearnerShell({
  current,
  children,
  wide = false,
  dashboard = false,
}: {
  current: LearnerNavItem;
  children: ReactNode;
  wide?: boolean;
  dashboard?: boolean;
}) {
  return (
    <>
      <LearnerNav current={current} wide={wide} dashboard={dashboard} />
      <main
        className={`mx-auto flex w-full flex-1 flex-col px-5 pt-0 sm:px-6 ${learnerFrameClass({ wide, dashboard })} ${
          dashboard ? "pb-16" : wide ? "pb-12" : "pb-16"
        }`}
      >
        {children}
      </main>
    </>
  );
}
