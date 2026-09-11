import { createHmac, timingSafeEqual } from "node:crypto";

export type AdminTokenPayload = {
  admin_id: string;
  email: string;
  role: string;
  exp: number;
};

function secret(): string {
  const value =
    process.env.ADMIN_SESSION_SECRET ?? process.env.SUPER_ADMIN_EMAIL;
  if (!value) {
    throw new Error("ADMIN_SESSION_SECRET is not set");
  }
  return value;
}

function sign(input: string): string {
  return createHmac("sha256", secret()).update(input).digest("base64url");
}

export function createAdminToken(payload: {
  admin_id: string;
  email: string;
  role: string;
}): string {
  const body: AdminTokenPayload = {
    ...payload,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
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
    ) as AdminTokenPayload;
    if (payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
