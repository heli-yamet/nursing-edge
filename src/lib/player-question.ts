import type { AssignedVersion, QuestionFormat } from "@/lib/learner-types";

export type PreCommitOption = {
  option_id: string;
  displayed_option: string;
  option_text: string;
};

export type PreCommitQuestion = {
  format: QuestionFormat;
  stem: string;
  options: PreCommitOption[];
};

const PROTECTED_KEYS = [
  "correct_option_ids",
  "is_correct",
  "rationales",
  "review_teaching",
  "topic",
  "topic_id",
] as const;

export function protectedPreCommitKeys(): readonly string[] {
  return PROTECTED_KEYS;
}

export function nextOpenAssignment(
  assigned: AssignedVersion[],
  attemptedVersionIds: ReadonlySet<string>,
): AssignedVersion | null {
  const ordered = [...assigned].sort((a, b) => a.position - b.position);
  return (
    ordered.find((item) => !attemptedVersionIds.has(item.question_version_id)) ??
    null
  );
}

export function toPreCommitQuestion(version: {
  format: QuestionFormat;
  stem: string;
  options: Array<{
    option_id: string;
    displayed_option: string;
    option_text: string;
  }>;
}): PreCommitQuestion {
  return {
    format: version.format,
    stem: version.stem,
    options: version.options.map((option) => ({
      option_id: option.option_id,
      displayed_option: option.displayed_option,
      option_text: option.option_text,
    })),
  };
}
