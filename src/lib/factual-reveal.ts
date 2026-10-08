export type RevealOption = {
  option_id: string;
  displayed_option: string;
  option_text: string;
};

export type DeeperExplanation = {
  why_it_wins: string;
  the_trap: string;
  carry_it_forward: string;
  concise_teaching_response: string;
};

export type FactualReveal = {
  outcome: "Correct" | "Incorrect";
  selection: RevealOption[];
  correct_options: RevealOption[];
  confidence: "Unsure" | "Sure" | "Confident";
  topic: string;
  learner_core_rationale: string;
  deeper: DeeperExplanation;
};

export const EMPTY_DEEPER: DeeperExplanation = {
  why_it_wins: "",
  the_trap: "",
  carry_it_forward: "",
  concise_teaching_response: "",
};
