export function manageSubscriptionUrl(input: {
  portalUrl?: string | null;
  storeDomain?: string | null;
}): string | null {
  const portal = input.portalUrl?.trim() ?? "";
  if (portal.startsWith("https://")) {
    return portal;
  }

  const domain = (input.storeDomain ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!domain) {
    return null;
  }
  return `https://${domain}/account`;
}

export function manageSubscriptionUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return manageSubscriptionUrl({
    portalUrl: env.SHOPIFY_MANAGE_SUBSCRIPTION_URL,
    storeDomain: env.SHOPIFY_STORE_DOMAIN,
  });
}
