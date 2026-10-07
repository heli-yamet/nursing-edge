export type RevealOption = {
  option_id: string;
  displayed_option: string;
  option_text: string;
};

export type FactualReveal = {
  outcome: "Correct" | "Incorrect";
  selection: RevealOption[];
  correct_options: RevealOption[];
  confidence: "Unsure" | "Sure" | "Confident";
  topic: string;
  learner_core_rationale: string;
};
