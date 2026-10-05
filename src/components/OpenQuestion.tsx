import type { PreCommitOption } from "@/lib/player-question";

export function OpenQuestion({
  label,
  position,
  size,
  stem,
  options,
}: {
  label: string;
  position: number;
  size: number;
  stem: string;
  options: PreCommitOption[];
}) {
  const progress = size > 0 ? Math.round((position / size) * 100) : 0;

  return (
    <article aria-labelledby="open-question-heading">
      <h1
        id="open-question-heading"
        className="text-[28px] leading-tight font-semibold text-[#163A59] sm:text-[32px]"
      >
        {label}
      </h1>
      <p className="mt-4 text-base font-medium text-[#163A59]">
        Question {position} of {size}
      </p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-[#E6EEF0]"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={size}
        aria-valuenow={position}
        aria-valuetext={`Question ${position} of ${size}`}
        aria-label="Session progress"
      >
        <div className="h-full bg-[#0B7F86]" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-8 text-base leading-7 whitespace-pre-wrap text-[#24313A]">
        {stem}
      </p>
      <ol className="mt-6 grid gap-3">
        {options.map((option) => (
          <li
            key={option.option_id}
            className="rounded-[10px] border border-[#D9E1E5] bg-white px-4 py-3 text-base leading-7 text-[#24313A]"
          >
            <span className="font-medium text-[#163A59]">
              {option.displayed_option}.
            </span>{" "}
            {option.option_text}
          </li>
        ))}
      </ol>
    </article>
  );
}
