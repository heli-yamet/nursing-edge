import { newPermanentId } from "@/lib/ids";
import { entitlements } from "@/lib/learner-collections";
import type { Entitlement } from "@/lib/learner-types";

export function normalizeLearnerEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidLearnerEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeLearnerEmail(email));
}

export function assertPermanentLearnerId(learnerId: string): void {
  const id = learnerId.trim();
  if (!id || id.includes("@") || id.startsWith("gid://shopify/")) {
    throw new Error("learner_id must be a permanent id");
  }
}

export function entitlementMatchesEmail(
  row: Entitlement,
  email: string,
): boolean {
  if (!row.email_hint) {
    return false;
  }
  return (
    normalizeLearnerEmail(row.email_hint) === normalizeLearnerEmail(email)
  );
}

export function claimEntitlements(
  rows: Entitlement[],
  learnerId: string,
  email: string,
  now: Date = new Date(),
): Entitlement[] {
  assertPermanentLearnerId(learnerId);
  return rows.map((row) => {
    if (row.learner_id !== null) {
      return row;
    }
    if (!entitlementMatchesEmail(row, email)) {
      return row;
    }
    return { ...row, learner_id: learnerId, updated_at: now };
  });
}

export function learnerHasAccess(
  rows: Entitlement[],
  learnerId: string,
): boolean {
  return rows.some(
    (row) =>
      row.learner_id === learnerId &&
      row.status === "ACTIVE" &&
      (row.source === "SHOPIFY" || row.source === "MANUAL_GRANT"),
  );
}

export function buildManualGrant(learnerId: string, now: Date): Entitlement {
  assertPermanentLearnerId(learnerId);
  return {
    entitlement_id: newPermanentId(),
    learner_id: learnerId,
    source: "MANUAL_GRANT",
    status: "ACTIVE",
    shopify_customer_id: null,
    shopify_subscription_id: null,
    email_hint: null,
    paid_through_at: null,
    revoked_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function claimUnclaimedEntitlements(
  learnerId: string,
  email: string,
  now: Date = new Date(),
): Promise<number> {
  assertPermanentLearnerId(learnerId);
  const hint = normalizeLearnerEmail(email);
  const collection = await entitlements();
  const result = await collection.updateMany(
    { learner_id: null, email_hint: hint },
    { $set: { learner_id: learnerId, updated_at: now } },
    { collation: { locale: "en", strength: 2 } },
  );
  return result.modifiedCount;
}

export async function readLearnerAccess(learnerId: string): Promise<boolean> {
  const collection = await entitlements();
  const found = await collection.findOne({
    learner_id: learnerId,
    status: "ACTIVE",
    source: { $in: ["SHOPIFY", "MANUAL_GRANT"] },
  });
  return Boolean(found);
}

export async function insertManualGrant(
  learnerId: string,
  now: Date = new Date(),
): Promise<Entitlement> {
  const row = buildManualGrant(learnerId, now);
  await (await entitlements()).insertOne(row);
  return row;
}
