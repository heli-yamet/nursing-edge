import { cookies } from "next/headers";
import {
  LEARNER_COOKIE,
  createLearnerToken,
  learnerCookieOptions,
} from "@/lib/learner-session";
import type { Learner } from "@/lib/learner-types";

export async function setLearnerSession(learner: Learner): Promise<void> {
  const token = createLearnerToken({
    learner_id: learner.learner_id,
    email: learner.email,
  });
  const jar = await cookies();
  jar.set(LEARNER_COOKIE, token, learnerCookieOptions());
}

export async function clearLearnerSession(): Promise<void> {
  const jar = await cookies();
  jar.set(LEARNER_COOKIE, "", { ...learnerCookieOptions(0), maxAge: 0 });
}

export async function readLearnerSessionToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(LEARNER_COOKIE)?.value;
}
