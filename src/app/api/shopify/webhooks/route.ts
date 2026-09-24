import {
  gateShopifyWebhook,
  persistUnclaimedShopifyEntitlement,
} from "@/lib/shopify-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const topic = req.headers.get("x-shopify-topic");
  const shop = req.headers.get("x-shopify-shop-domain");
  const hasSecret = Boolean(process.env.SHOPIFY_WEBHOOK_SECRET?.trim());
  const hasHmac = Boolean(req.headers.get("x-shopify-hmac-sha256")?.trim());

  console.log("[shopify webhook] 1 received", {
    topic,
    shop,
    hasSecret,
    hasHmac,
    bodyLength: rawBody.length,
  });

  const gated = gateShopifyWebhook({
    rawBody,
    hmacHeader: req.headers.get("x-shopify-hmac-sha256"),
    shopHeader: shop,
    topicHeader: topic,
    secret: process.env.SHOPIFY_WEBHOOK_SECRET ?? null,
    expectedShop: process.env.SHOPIFY_STORE_DOMAIN ?? null,
    now: new Date(),
  });

  if (!gated.ok) {
    console.log("[shopify webhook] 2 rejected", {
      status: gated.status,
      error: gated.error,
    });
    return Response.json(
      { ok: false, error: gated.error },
      { status: gated.status },
    );
  }

  if (!gated.event) {
    console.log("[shopify webhook] 3 ignored (no subscription id)", { topic });
    return Response.json({ ok: true, ignored: true });
  }

  console.log("[shopify webhook] 4 parsed", {
    shopify_subscription_id: gated.event.shopify_subscription_id,
    shopify_customer_id: gated.event.shopify_customer_id,
    hasEmailHint: Boolean(gated.event.email_hint),
    paid_through_at: gated.event.paid_through_at,
    signal: gated.event.signal,
  });

  try {
    const row = await persistUnclaimedShopifyEntitlement(gated.event);
    console.log("[shopify webhook] 5 persisted", {
      entitlement_id: row.entitlement_id,
      status: row.status,
      learner_id: row.learner_id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    console.log("[shopify webhook] 5 persist failed", { error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
