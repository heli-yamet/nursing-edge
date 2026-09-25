import { redirect } from "next/navigation";
import { learnerEntryPath, learnerEntryStep } from "@/lib/learner-entry";
import { learnerFromToken } from "@/lib/learner-auth";
import { readLearnerSessionToken } from "@/lib/learner-cookie";
import type { Learner } from "@/lib/learner-types";

export async function requireLearner(): Promise<Learner> {
  const token = await readLearnerSessionToken();
  const learner = await learnerFromToken(token);
  if (!learner) {
    redirect("/sign-in");
  }
  return learner;
}

export async function requireEntryStep(
  expected: "terms" | "orientation" | "app",
): Promise<Learner> {
  const learner = await requireLearner();
  const step = learnerEntryStep(learner);
  if (expected === "app") {
    if (step !== "home") {
      redirect(learnerEntryPath(learner));
    }
    return learner;
  }
  if (step !== expected) {
    redirect(learnerEntryPath(learner));
  }
  return learner;
}
