import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { createLearnerId, emailIsNotLearnerId } from "@/lib/evidence-rules";
import { verifyLearnerToken } from "@/lib/learner-session";
import {
  assertPermanentLearnerId,
  claimUnclaimedEntitlements,
  isValidLearnerEmail,
  normalizeLearnerEmail,
  readLearnerAccess,
} from "@/lib/learner-access";
import { learners } from "@/lib/learner-collections";
import { getDb } from "@/lib/mongo";
import type { Learner, LearnerCode } from "@/lib/learner-types";

const CODE_COOLDOWN_MS = 60_000;
const CHECK_COOLDOWN_MS = 3_000;

export function newVerificationCode(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, "0");
}

export function registrationInputOk(input: {
  firstName: string;
  email: string;
  password: string;
  code: string;
}): boolean {
  const firstName = input.firstName.trim();
  return (
    firstName.length > 0 &&
    firstName.length <= 80 &&
    isValidLearnerEmail(input.email) &&
    input.password.length >= 8 &&
    /^\d{8}$/.test(input.code.trim())
  );
}

export function signInInputOk(input: {
  email: string;
  password: string;
  code?: string;
}): boolean {
  if (!isValidLearnerEmail(input.email) || input.password.length === 0) {
    return false;
  }
  const code = input.code?.trim() ?? "";
  return code.length === 0 || /^\d{8}$/.test(code);
}

export async function learnerCodes() {
  return (await getDb()).collection<LearnerCode>("learner_codes");
}

export async function findLearnerByEmail(
  email: string,
): Promise<Learner | null> {
  return (await learners()).findOne({
    email: normalizeLearnerEmail(email),
  });
}

export async function findLearnerById(
  learnerId: string,
): Promise<Learner | null> {
  return (await learners()).findOne({ learner_id: learnerId });
}

export async function sendLearnerCode(
  email: string,
  purpose: "signup" | "signin" = "signup",
): Promise<boolean> {
  const normalized = normalizeLearnerEmail(email);
  const codes = await learnerCodes();
  const existing = await codes.findOne({ email: normalized });
  const now = new Date();

  if (
    existing?.last_generated &&
    now.getTime() - existing.last_generated.getTime() < CODE_COOLDOWN_MS
  ) {
    return false;
  }

  const code = newVerificationCode();
  await codes.updateOne(
    { email: normalized },
    {
      $set: {
        email: normalized,
        code,
        last_generated: now,
        last_tried: existing?.last_tried ?? null,
      },
    },
    { upsert: true },
  );

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY or EMAIL_FROM is not set");
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: normalized,
    subject: "Your Nursing Edge verification code",
    text:
      purpose === "signin"
        ? `Your verification code is ${code}. It is for signing in to your Nursing Edge account.`
        : `Your verification code is ${code}. It is for creating your Nursing Edge account.`,
  });

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

export async function checkLearnerCode(
  email: string,
  code: string,
): Promise<{ ok: boolean; rateLimited: boolean }> {
  const normalized = normalizeLearnerEmail(email);
  const submitted = code.trim();
  const codes = await learnerCodes();
  const existing = await codes.findOne({ email: normalized });
  const now = new Date();

  if (!existing) {
    return { ok: false, rateLimited: false };
  }

  if (
    existing.last_tried &&
    now.getTime() - existing.last_tried.getTime() < CHECK_COOLDOWN_MS
  ) {
    return { ok: false, rateLimited: true };
  }

  await codes.updateOne(
    { email: normalized },
    { $set: { last_tried: now } },
  );

  if (existing.code !== submitted) {
    return { ok: false, rateLimited: false };
  }

  return { ok: true, rateLimited: false };
}

export async function consumeLearnerCode(email: string): Promise<void> {
  const codes = await learnerCodes();
  await codes.deleteOne({ email: normalizeLearnerEmail(email) });
}

export async function buildLearnerRecord(input: {
  firstName: string;
  email: string;
  password: string;
  now?: Date;
}): Promise<Learner> {
  const learner_id = createLearnerId();
  assertPermanentLearnerId(learner_id);
  const email = normalizeLearnerEmail(input.email);
  if (!emailIsNotLearnerId(learner_id, email)) {
    throw new Error("learner_id must not be an email");
  }

  return {
    learner_id,
    email,
    password_hash: await bcrypt.hash(input.password, 12),
    first_name: input.firstName.trim(),
    email_verified: true,
    terms_accepted_at: null,
    orientation_completed_at: null,
    created_at: input.now ?? new Date(),
  };
}

export async function registerVerifiedLearner(input: {
  firstName: string;
  email: string;
  password: string;
}): Promise<Learner> {
  const learner = await buildLearnerRecord(input);
  await (await learners()).insertOne(learner);
  await claimUnclaimedEntitlements(learner.learner_id, learner.email);
  return learner;
}

export async function passwordMatches(
  learner: Learner,
  password: string,
): Promise<boolean> {
  return bcrypt.compare(password, learner.password_hash);
}

export async function learnerFromToken(
  token: string | undefined,
): Promise<Learner | null> {
  if (!token) {
    return null;
  }
  const payload = verifyLearnerToken(token);
  if (!payload) {
    return null;
  }
  const learner = await findLearnerById(payload.learner_id);
  if (!learner || learner.email !== payload.email || !learner.email_verified) {
    return null;
  }
  return learner;
}

export async function linkAndReadAccess(learner: Learner): Promise<boolean> {
  if (!learner.email_verified) {
    return false;
  }
  await claimUnclaimedEntitlements(learner.learner_id, learner.email);
  return readLearnerAccess(learner.learner_id);
}
