export type LearnerEntryStep = "terms" | "orientation" | "home";

export type LearnerEntryPath = "/terms" | "/orientation" | "/home";

export function learnerEntryStep(learner: {
  terms_accepted_at: Date | null;
  orientation_completed_at: Date | null;
}): LearnerEntryStep {
  if (!learner.terms_accepted_at) {
    return "terms";
  }
  if (!learner.orientation_completed_at) {
    return "orientation";
  }
  return "home";
}

export function entryDestination(value: string | undefined): LearnerEntryPath {
  if (value === "/terms" || value === "/orientation" || value === "/home") {
    return value;
  }
  return "/terms";
}

export function learnerEntryPath(learner: {
  terms_accepted_at: Date | null;
  orientation_completed_at: Date | null;
}): LearnerEntryPath {
  const step = learnerEntryStep(learner);
  if (step === "terms") {
    return "/terms";
  }
  if (step === "orientation") {
    return "/orientation";
  }
  return "/home";
}
