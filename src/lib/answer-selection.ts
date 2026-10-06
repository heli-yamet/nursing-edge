import type { Confidence, QuestionFormat } from "@/lib/learner-types";

export const CONFIDENCE_CHOICES: readonly {
  value: Confidence;
  label: string;
  meaning: string;
}[] = [
  {
    value: "UNSURE",
    label: "Unsure",
    meaning: "I am uncertain or mostly guessing.",
  },
  {
    value: "SURE",
    label: "Sure",
    meaning: "I think this is correct, but I still have some doubt.",
  },
  {
    value: "CONFIDENT",
    label: "Confident",
    meaning: "I believe this is correct with little or no doubt.",
  },
];

function usesKnownOptions(
  optionIds: readonly string[],
  selectedIds: readonly string[],
): boolean {
  if (new Set(selectedIds).size !== selectedIds.length) {
    return false;
  }
  const allowed = new Set(optionIds);
  return selectedIds.every((id) => allowed.has(id));
}

export function sameAnswer(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
}

export function isValidAnswer(
  format: string,
  optionIds: readonly string[],
  selectedIds: readonly string[],
): boolean {
  if (!usesKnownOptions(optionIds, selectedIds)) {
    return false;
  }
  if (format === "MCQ") {
    return selectedIds.length === 1;
  }
  if (format === "SATA") {
    return selectedIds.length >= 1;
  }
  return false;
}

export function applyOptionChoice(
  format: QuestionFormat,
  selectedIds: readonly string[],
  optionId: string,
): string[] {
  if (format === "MCQ") {
    return [optionId];
  }
  return selectedIds.includes(optionId)
    ? selectedIds.filter((id) => id !== optionId)
    : [...selectedIds, optionId];
}

export function confidenceAfterSelectionChange(
  previousIds: readonly string[],
  nextIds: readonly string[],
  confidence: Confidence | null,
): Confidence | null {
  if (!sameAnswer(previousIds, nextIds)) {
    return null;
  }
  return confidence;
}

export function canSubmitAnswer(
  format: string,
  optionIds: readonly string[],
  selectedIds: readonly string[],
  confidence: Confidence | null,
): boolean {
  return (
    isValidAnswer(format, optionIds, selectedIds) && confidence !== null
  );
}
