import Link from "next/link";

const ITEMS = [
  ["home", "/home", "Home"],
  ["practice", "/practice", "Practice"],
  ["review", "/review", "Review"],
  ["progress", "/progress", "Progress"],
  ["account", "/account", "Account"],
] as const;

export function LearnerNav({
  current,
}: {
  current: (typeof ITEMS)[number][0];
}) {
  return (
    <nav aria-label="Learner" className="mt-8 flex flex-wrap gap-2">
      {ITEMS.map(([id, href, label]) => {
        const active = current === id;
        return (
          <Link
            key={id}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-[48px] items-center rounded-[10px] px-4 text-base font-medium ${
              active
                ? "bg-[#0B7F86] text-white"
                : "border border-[#D9E1E5] bg-white text-[#163A59]"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
