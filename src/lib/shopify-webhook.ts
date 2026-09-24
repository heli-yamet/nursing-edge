import { createHmac, timingSafeEqual } from "node:crypto";
import { newPermanentId } from "@/lib/ids";
import { entitlements } from "@/lib/learner-collections";
import type { Entitlement, EntitlementStatus } from "@/lib/learner-types";

export type ShopifyAccessSignal =
  | "ACTIVE"
  | "SCHEDULED_CANCEL"
  | "EXPIRED"
  | "REFUND"
  | "CHARGEBACK";

export type ShopifyPayEvent = {
  shopify_subscription_id: string;
  shopify_customer_id: string | null;
  email_hint: string | null;
  paid_through_at: Date | null;
  signal: ShopifyAccessSignal;
  occurred_at: Date;
};

export type ShopifyWebhookGate =
  | { ok: false; status: number; error: string }
  | { ok: true; event: ShopifyPayEvent | null };

function readTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function shopifySignalGrantsAccess(
  signal: ShopifyAccessSignal,
  now: Date,
  paidThroughAt: Date | null,
): boolean {
  if (signal === "ACTIVE") {
    return true;
  }

  if (signal === "SCHEDULED_CANCEL") {
    return paidThroughAt !== null && now.getTime() <= paidThroughAt.getTime();
  }

  return false;
}

export function entitlementStatusFromSignal(
  signal: ShopifyAccessSignal,
  now: Date,
  paidThroughAt: Date | null,
): EntitlementStatus {
  if (shopifySignalGrantsAccess(signal, now, paidThroughAt)) {
    return "ACTIVE";
  }

  if (signal === "REFUND" || signal === "CHARGEBACK") {
    return "REVOKED";
  }

  return "EXPIRED";
}

export function signShopifyWebhook(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

export function verifyShopifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
  secret: string,
): boolean {
  const provided = readTrimmed(hmacHeader);
  if (!secret || !provided) {
    return false;
  }

  const expected = signShopifyWebhook(rawBody, secret);
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, providedBuf);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    return readTrimmed(value);
  }
  return null;
}

function asDate(value: unknown): Date | null {
  const raw = asString(value);
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeEmailHint(value: unknown): string | null {
  const email = asString(value);
  return email ? email.toLowerCase() : null;
}

function subscriptionGid(id: string): string {
  if (id.startsWith("gid://")) {
    return id;
  }
  return `gid://shopify/SubscriptionContract/${id}`;
}

function extractSubscriptionId(
  topic: string,
  payload: Record<string, unknown>,
): string | null {
  const graphqlId = asString(payload.admin_graphql_api_id);
  if (graphqlId?.includes("SubscriptionContract")) {
    return graphqlId;
  }

  const nested = asRecord(payload.subscription_contract);
  const nestedId =
    asString(nested?.admin_graphql_api_id) ?? asString(nested?.id);
  if (nestedId) {
    return subscriptionGid(nestedId);
  }

  const referenced =
    asString(payload.subscription_contract_id) ??
    asString(payload.subscription_id);
  if (referenced) {
    return subscriptionGid(referenced);
  }

  if (topic.startsWith("subscription_contracts/")) {
    const id = asString(payload.id);
    if (id) {
      return subscriptionGid(id);
    }
  }

  if (topic === "orders/paid" || topic.startsWith("orders/")) {
    const orderGid = asString(payload.admin_graphql_api_id);
    if (orderGid?.includes("/Order/")) {
      return orderGid;
    }
    const orderId = asString(payload.id);
    if (orderId) {
      return orderId.startsWith("gid://")
        ? orderId
        : `gid://shopify/Order/${orderId}`;
    }
  }

  return null;
}

function extractCustomerId(payload: Record<string, unknown>): string | null {
  const customer = asRecord(payload.customer);
  return (
    asString(payload.customer_id) ??
    asString(customer?.id) ??
    asString(customer?.admin_graphql_api_id)
  );
}

function extractEmailHint(payload: Record<string, unknown>): string | null {
  const customer = asRecord(payload.customer);
  return (
    normalizeEmailHint(payload.email) ??
    normalizeEmailHint(payload.email_hint) ??
    normalizeEmailHint(customer?.email)
  );
}

function extractPaidThrough(payload: Record<string, unknown>): Date | null {
  const billing = asRecord(payload.billing_policy);
  return (
    asDate(payload.paid_through) ??
    asDate(payload.paid_through_at) ??
    asDate(payload.next_billing_date) ??
    asDate(payload.current_period_end) ??
    asDate(billing?.next_billing_date)
  );
}

function extractStatus(payload: Record<string, unknown>): string | null {
  return asString(payload.status) ?? asString(payload.financial_status);
}

function signalFromTopicAndStatus(
  topic: string,
  status: string | null,
  paidThroughAt: Date | null,
  now: Date,
): ShopifyAccessSignal {
  const loweredTopic = topic.toLowerCase();
  if (loweredTopic.includes("refund")) {
    return "REFUND";
  }
  if (loweredTopic.includes("dispute") || loweredTopic.includes("chargeback")) {
    return "CHARGEBACK";
  }

  const loweredStatus = (status ?? "").toLowerCase();
  if (loweredStatus === "refunded" || loweredStatus === "refund") {
    return "REFUND";
  }
  if (loweredStatus === "chargeback" || loweredStatus === "charged_back") {
    return "CHARGEBACK";
  }
  if (
    loweredStatus === "expired" ||
    loweredStatus === "unpaid" ||
    loweredStatus === "declined" ||
    loweredStatus === "failed"
  ) {
    return "EXPIRED";
  }
  if (
    loweredStatus === "cancelled" ||
    loweredStatus === "canceled" ||
    loweredStatus === "paused"
  ) {
    if (paidThroughAt && paidThroughAt.getTime() >= now.getTime()) {
      return "SCHEDULED_CANCEL";
    }
    return "EXPIRED";
  }
  if (
    loweredStatus === "active" ||
    loweredStatus === "paid" ||
    loweredTopic === "orders/paid" ||
    loweredTopic.startsWith("subscription_contracts/") ||
    loweredTopic.includes("billing_attempt")
  ) {
    return "ACTIVE";
  }

  return "EXPIRED";
}

export function parseShopifyWebhookPayload(
  topic: string,
  payload: unknown,
  now: Date,
): ShopifyPayEvent | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const shopify_subscription_id = extractSubscriptionId(topic, record);
  if (!shopify_subscription_id) {
    return null;
  }

  const paid_through_at = extractPaidThrough(record);
  const occurred_at =
    asDate(record.updated_at) ?? asDate(record.created_at) ?? now;

  return {
    shopify_subscription_id,
    shopify_customer_id: extractCustomerId(record),
    email_hint: extractEmailHint(record),
    paid_through_at,
    signal: signalFromTopicAndStatus(
      topic,
      extractStatus(record),
      paid_through_at,
      now,
    ),
    occurred_at,
  };
}

export function gateShopifyWebhook(input: {
  rawBody: string;
  hmacHeader: string | null;
  shopHeader: string | null;
  topicHeader: string | null;
  secret: string | null;
  expectedShop: string | null;
  now: Date;
}): ShopifyWebhookGate {
  const secret = readTrimmed(input.secret);
  if (!secret) {
    return { ok: false, status: 503, error: "webhook_secret_missing" };
  }

  if (!verifyShopifyWebhookHmac(input.rawBody, input.hmacHeader, secret)) {
    return { ok: false, status: 401, error: "invalid_hmac" };
  }

  const expectedShop = readTrimmed(input.expectedShop)?.toLowerCase() ?? null;
  const shop = readTrimmed(input.shopHeader)?.toLowerCase() ?? null;
  if (expectedShop && shop !== expectedShop) {
    return { ok: false, status: 401, error: "unexpected_shop" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody) as unknown;
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }

  return {
    ok: true,
    event: parseShopifyWebhookPayload(
      input.topicHeader ?? "",
      payload,
      input.now,
    ),
  };
}

export function mergeUnclaimedEntitlement(
  existing: Entitlement | null,
  event: ShopifyPayEvent,
  now: Date = event.occurred_at,
): Entitlement {
  const status = entitlementStatusFromSignal(
    event.signal,
    now,
    event.paid_through_at,
  );
  const email_hint = event.email_hint;

  if (!existing) {
    return {
      entitlement_id: newPermanentId(),
      learner_id: null,
      source: "SHOPIFY",
      status,
      shopify_customer_id: event.shopify_customer_id,
      shopify_subscription_id: event.shopify_subscription_id,
      email_hint,
      paid_through_at: event.paid_through_at,
      revoked_at: status === "REVOKED" ? now : null,
      created_at: now,
      updated_at: event.occurred_at,
    };
  }

  if (event.occurred_at.getTime() < existing.updated_at.getTime()) {
    return existing;
  }

  return {
    ...existing,
    learner_id: existing.learner_id,
    status,
    shopify_customer_id: event.shopify_customer_id ?? existing.shopify_customer_id,
    email_hint: email_hint ?? existing.email_hint,
    paid_through_at: event.paid_through_at ?? existing.paid_through_at,
    revoked_at:
      status === "REVOKED" ? (existing.revoked_at ?? now) : null,
    updated_at: event.occurred_at,
  };
}

export async function persistUnclaimedShopifyEntitlement(
  event: ShopifyPayEvent,
): Promise<Entitlement> {
  const collection = await entitlements();
  const existing = await collection.findOne({
    shopify_subscription_id: event.shopify_subscription_id,
  });
  const next = mergeUnclaimedEntitlement(existing, event);

  if (existing && next === existing) {
    return existing;
  }

  if (!existing) {
    await collection.insertOne(next);
    return next;
  }

  await collection.updateOne(
    { entitlement_id: existing.entitlement_id },
    {
      $set: {
        status: next.status,
        shopify_customer_id: next.shopify_customer_id,
        email_hint: next.email_hint,
        paid_through_at: next.paid_through_at,
        revoked_at: next.revoked_at,
        updated_at: next.updated_at,
      },
    },
  );
  return next;
}
