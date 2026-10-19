const INTERPRETATION_UNAVAILABLE =
  "The interpretation for this response is unavailable.";

type Outcome = "Correct" | "Incorrect";
type ConfidenceWord = "Unsure" | "Sure" | "Confident";

export type SixStateLines = {
  available: true;
  immediate: string;
  strengthening: string;
};

export type SixStateUnavailable = {
  available: false;
  message: string;
};

export type SixStateCopy = SixStateLines | SixStateUnavailable;

const LINES: Record<`${Outcome}|${ConfidenceWord}`, SixStateLines> = {
  "Correct|Confident": {
    available: true,
    immediate: "Your answer and confidence aligned on this question.",
    strengthening:
      "Use the rationale to confirm the reasoning pattern you can apply again.",
  },
  "Correct|Sure": {
    available: true,
    immediate: "You selected the correct answer, but some doubt remained.",
    strengthening:
      "Use the rationale to identify the cue that would make this decision more certain next time.",
  },
  "Correct|Unsure": {
    available: true,
    immediate:
      "You selected the correct answer while feeling uncertain. The knowledge may be present, but it is not yet fully trusted or easy to retrieve.",
    strengthening:
      "Focus on the decisive cue and why it makes the correct answer safest or best.",
  },
  "Incorrect|Unsure": {
    available: true,
    immediate:
      "You recognized uncertainty, and the answer was incorrect. This response points to a knowledge or reasoning gap that needs reinforcement.",
    strengthening:
      "Use the rationale to identify the missing cue, rule, or clinical connection.",
  },
  "Incorrect|Sure": {
    available: true,
    immediate:
      "You thought the answer was probably correct, but it was not. An incomplete or mistaken reasoning pattern may be guiding the decision.",
    strengthening:
      "Compare your answer with the correct answer and identify the cue that should change your reasoning.",
  },
  "Incorrect|Confident": {
    available: true,
    immediate:
      "You strongly believed the answer was correct, but it was not. This is the strongest mismatch between confidence and performance.",
    strengthening:
      "Study the rationale carefully and identify the specific cue or rule that overturns the original choice.",
  },
};

function isOutcome(value: unknown): value is Outcome {
  return value === "Correct" || value === "Incorrect";
}

function isConfidence(value: unknown): value is ConfidenceWord {
  return value === "Unsure" || value === "Sure" || value === "Confident";
}

export function sixStateCopy(
  outcome: unknown,
  confidence: unknown,
): SixStateCopy {
  if (!isOutcome(outcome) || !isConfidence(confidence)) {
    return { available: false, message: INTERPRETATION_UNAVAILABLE };
  }
  return LINES[`${outcome}|${confidence}`];
}
