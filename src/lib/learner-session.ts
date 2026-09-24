import { createHmac, timingSafeEqual } from "node:crypto";

export const LEARNER_COOKIE = "learner_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export type LearnerTokenPayload = {
  learner_id: string;
  email: string;
  exp: number;
};

function secret(): string {
  const value =
    process.env.LEARNER_SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (!value) {
    throw new Error("LEARNER_SESSION_SECRET is not set");
  }
  return value;
}

function sign(input: string): string {
  return createHmac("sha256", secret()).update(input).digest("base64url");
}

export function createLearnerToken(payload: {
  learner_id: string;
  email: string;
}): string {
  const body: LearnerTokenPayload = {
    ...payload,
    exp: Date.now() + SESSION_MS,
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyLearnerToken(token: string): LearnerTokenPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as LearnerTokenPayload;
    if (payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function learnerCookieOptions(maxAgeSeconds = SESSION_MS / 1000) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
