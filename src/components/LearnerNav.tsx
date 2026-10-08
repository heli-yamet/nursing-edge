import Link from "next/link";

const ITEMS = [
  ["home", "/home", "Home"],
  ["practice", "/practice", "Practice"],
  ["review", "/review", "Review"],
  ["progress", "/progress", "Progress"],
  ["account", "/account", "Account"],
] as const;

export type LearnerNavItem = (typeof ITEMS)[number][0];

export function learnerFrameClass(options: {
  wide?: boolean;
  dashboard?: boolean;
}): string {
  if (options.dashboard) {
    return "max-w-[1120px]";
  }
  if (options.wide) {
    return "max-w-[1024px]";
  }
  return "max-w-[760px]";
}

export function LearnerNav({
  current,
  wide = false,
  dashboard = false,
}: {
  current: LearnerNavItem;
  wide?: boolean;
  dashboard?: boolean;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-[#D9E1E5] bg-white">
      <div
        className={`mx-auto flex w-full items-center justify-between gap-4 px-4 py-2 sm:px-6 ${learnerFrameClass({ wide, dashboard })}`}
      >
        <span className="hidden text-lg font-semibold text-[#163A59] sm:inline">
          Nursing Edge
        </span>
        <nav
          aria-label="Learner"
          className="grid w-full grid-cols-5 gap-1 sm:flex sm:w-auto"
        >
          {ITEMS.map(([id, href, label]) => {
            const active = current === id;
            return (
              <Link
                key={id}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-[48px] items-center justify-center rounded-[10px] border-b-2 px-2 text-sm font-medium sm:px-3 sm:text-base ${
                  active
                    ? "border-[#0B7F86] bg-[#E8F5F5] font-semibold text-[#08666C]"
                    : "border-transparent text-[#163A59] hover:bg-[#F7F9FA]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
