import { randomInt } from "node:crypto";
import { Resend } from "resend";
import { getDb } from "@/lib/mongo";
import type { AdminUser, AdminUserCode } from "@/lib/admin-types";

const CODE_COOLDOWN_MS = 60_000;
const CHECK_COOLDOWN_MS = 3_000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export async function adminUsers() {
  return (await getDb()).collection<AdminUser>("admin_users");
}

export async function adminUserCodes() {
  return (await getDb()).collection<AdminUserCode>("admin_users_codes");
}

export async function findAdminByEmail(email: string): Promise<AdminUser | null> {
  const users = await adminUsers();
  return users.findOne({ email: normalizeEmail(email) });
}

export async function sendCode(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const codes = await adminUserCodes();
  const existing = await codes.findOne({ email: normalized });
  const now = new Date();

  if (
    existing?.last_generated &&
    now.getTime() - existing.last_generated.getTime() < CODE_COOLDOWN_MS
  ) {
    return false;
  }

  const code = String(randomInt(0, 100_000_000)).padStart(8, "0");

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
    subject: "Your Nursing Edge Admin verification code",
    text: `Your verification code is ${code}. It is for Nursing Edge Admin sign-in or registration.`,
  });

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

export async function checkCode(
  email: string,
  code: string,
): Promise<{ ok: boolean; rateLimited: boolean }> {
  const normalized = normalizeEmail(email);
  const submitted = code.trim();
  const codes = await adminUserCodes();
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

export async function consumeCode(email: string): Promise<void> {
  const codes = await adminUserCodes();
  await codes.deleteOne({ email: normalizeEmail(email) });
}

export async function superAdminExists(): Promise<boolean> {
  const users = await adminUsers();
  const found = await users.findOne({ role: "SUPER_ADMIN" });
  return Boolean(found);
}

export function isSuperAdminEmail(email: string): boolean {
  const configured = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!configured) {
    return false;
  }
  return normalizeEmail(email) === configured;
}

export { normalizeEmail, CODE_COOLDOWN_MS, CHECK_COOLDOWN_MS };
