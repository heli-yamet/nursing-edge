export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();

  let body: unknown = rawBody;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    body = rawBody;
  }

  const received = {
    body,
    headers: {
      "x-shopify-topic": req.headers.get("x-shopify-topic"),
      "x-shopify-shop-domain": req.headers.get("x-shopify-shop-domain"),
      "x-shopify-hmac-sha256": req.headers.get("x-shopify-hmac-sha256"),
      "x-shopify-webhook-id": req.headers.get("x-shopify-webhook-id"),
      "x-shopify-api-version": req.headers.get("x-shopify-api-version"),
      "x-shopify-triggered-at": req.headers.get("x-shopify-triggered-at"),
    },
  };

  console.log(received);
  return Response.json({ ok: true, received });
}
