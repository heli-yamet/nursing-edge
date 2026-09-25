import { newPermanentId } from "@/lib/ids";
import { accessGrantAudits, entitlements } from "@/lib/learner-collections";
import type {
  AccessGrantAudit,
  AccessGrantOutcome,
  Entitlement,
} from "@/lib/learner-types";

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

export type RegistrationGate = "paid" | "granted" | "unpaid";

export function registrationGate(
  rows: Entitlement[],
  email: string,
): RegistrationGate {
  const matching = rows.filter((row) => entitlementMatchesEmail(row, email));
  if (
    matching.some(
      (row) => row.source === "MANUAL_GRANT" && row.status === "ACTIVE",
    )
  ) {
    return "granted";
  }
  if (matching.some((row) => row.source === "SHOPIFY")) {
    return "paid";
  }
  return "unpaid";
}

export async function registrationGateForEmail(
  email: string,
): Promise<RegistrationGate> {
  const hint = normalizeLearnerEmail(email);
  const rows = await (await entitlements())
    .find({ email_hint: hint })
    .collation({ locale: "en", strength: 2 })
    .toArray();
  return registrationGate(rows, email);
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

const ACTIVE_GRANT_REASON = "This email already has an active manual grant.";

export type UnpaidGrantDecision =
  | { ok: true; email: string }
  | { ok: false; email: string; reason: string };

export function decideUnpaidManualGrant(
  email: string,
  existing: Entitlement[],
): UnpaidGrantDecision {
  const hint = normalizeLearnerEmail(email);
  if (!isValidLearnerEmail(hint)) {
    return { ok: false, email: hint, reason: "Enter a valid email address." };
  }

  const activeGrant = existing.some(
    (row) =>
      row.source === "MANUAL_GRANT" &&
      row.status === "ACTIVE" &&
      row.email_hint !== null &&
      normalizeLearnerEmail(row.email_hint) === hint,
  );
  if (activeGrant) {
    return { ok: false, email: hint, reason: ACTIVE_GRANT_REASON };
  }

  return { ok: true, email: hint };
}

export function buildUnclaimedManualGrant(email: string, now: Date): Entitlement {
  const hint = normalizeLearnerEmail(email);
  if (!isValidLearnerEmail(hint)) {
    throw new Error("email must be valid");
  }

  return {
    entitlement_id: newPermanentId(),
    learner_id: null,
    source: "MANUAL_GRANT",
    status: "ACTIVE",
    shopify_customer_id: null,
    shopify_subscription_id: null,
    email_hint: hint,
    paid_through_at: null,
    revoked_at: null,
    created_at: now,
    updated_at: now,
  };
}

export type UnpaidGrantResult = {
  outcome: AccessGrantOutcome;
  email: string;
  reason: string | null;
  entitlement_id: string | null;
};

export async function grantUnpaidAccess(input: {
  actorAdminId: string;
  email: string;
  now?: Date;
}): Promise<UnpaidGrantResult> {
  const now = input.now ?? new Date();
  const hint = normalizeLearnerEmail(input.email);
  const collection = await entitlements();
  const existing = await collection
    .find({ source: "MANUAL_GRANT", email_hint: hint })
    .collation({ locale: "en", strength: 2 })
    .toArray();
  const decision = decideUnpaidManualGrant(hint, existing);

  if (!decision.ok) {
    await recordAccessGrantAudit({
      actorAdminId: input.actorAdminId,
      email: decision.email,
      occurredAt: now,
      outcome: "REJECTED",
      reason: decision.reason,
      entitlementId: null,
    });
    return {
      outcome: "REJECTED",
      email: decision.email,
      reason: decision.reason,
      entitlement_id: null,
    };
  }

  const row = buildUnclaimedManualGrant(decision.email, now);
  try {
    await collection.insertOne(row);
  } catch (error) {
    const duplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000;
    if (!duplicate) {
      throw error;
    }
    await recordAccessGrantAudit({
      actorAdminId: input.actorAdminId,
      email: decision.email,
      occurredAt: now,
      outcome: "REJECTED",
      reason: ACTIVE_GRANT_REASON,
      entitlementId: null,
    });
    return {
      outcome: "REJECTED",
      email: decision.email,
      reason: ACTIVE_GRANT_REASON,
      entitlement_id: null,
    };
  }

  await recordAccessGrantAudit({
    actorAdminId: input.actorAdminId,
    email: decision.email,
    occurredAt: now,
    outcome: "GRANTED",
    reason: null,
    entitlementId: row.entitlement_id,
  });
  return {
    outcome: "GRANTED",
    email: decision.email,
    reason: null,
    entitlement_id: row.entitlement_id,
  };
}

export async function listRecentAccessGrantAudits(
  limit = 20,
): Promise<AccessGrantAudit[]> {
  return (await accessGrantAudits())
    .find({})
    .sort({ occurred_at: -1 })
    .limit(limit)
    .toArray();
}

async function recordAccessGrantAudit(input: {
  actorAdminId: string;
  email: string;
  occurredAt: Date;
  outcome: AccessGrantOutcome;
  reason: string | null;
  entitlementId: string | null;
}): Promise<void> {
  const audit: AccessGrantAudit = {
    audit_id: newPermanentId(),
    actor_admin_id: input.actorAdminId,
    email: input.email,
    occurred_at: input.occurredAt,
    outcome: input.outcome,
    reason: input.reason,
    entitlement_id: input.entitlementId,
  };
  await (await accessGrantAudits()).insertOne(audit);
}
