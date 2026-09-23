import {
  gateShopifyWebhook,
  persistUnclaimedShopifyEntitlement,
} from "@/lib/shopify-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  console.log(JSON.parse(rawBody));
  const gated = gateShopifyWebhook({
    rawBody,
    hmacHeader: req.headers.get("x-shopify-hmac-sha256"),
    shopHeader: req.headers.get("x-shopify-shop-domain"),
    topicHeader: req.headers.get("x-shopify-topic"),
    secret: process.env.SHOPIFY_WEBHOOK_SECRET ?? null,
    expectedShop: process.env.SHOPIFY_STORE_DOMAIN ?? null,
    now: new Date(),
  });

  if (!gated.ok) {
    return Response.json(
      { ok: false, error: gated.error },
      { status: gated.status },
    );
  }

  if (!gated.event) {
    return Response.json({ ok: true, ignored: true });
  }

  try {
    await persistUnclaimedShopifyEntitlement(gated.event);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
