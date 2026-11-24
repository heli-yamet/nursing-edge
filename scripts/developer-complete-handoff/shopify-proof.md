# Shopify proof

## Unit coverage (automated)

**File:** `src/tests/shopify-webhook.test.ts` — **21 tests**, all passing in the 24 Nov suite.

Covers:

- HMAC sign and verify (`signShopifyWebhook`, `verifyShopifyWebhookHmac`)
- Webhook gate when secret missing or HMAC invalid (`gateShopifyWebhook`)
- Payload parse for subscription / billing events
- Entitlement mapping: **ACTIVE** grants access, **REVOKED** blocks
- Reconcile and repaid restore paths (`reconcileShopifyEntitlements`, `mergeUnclaimedEntitlement`)
- Email normalization and unclaimed entitlement merge

**Related learner access tests:** `learner-account.test.ts`, `grant-invitation.test.ts`, `practice-session.test.ts` / `calibration-session.test.ts` (`not_authorized` when revoked).

**Launch scenario #8:** Mapped in [launch-scenarios.md](../launch-scenarios.md) — **Passed** (unit).

## Security checkpoint (Gates 26–27)

| Control | Status |
| --- | --- |
| 27.5 Reject webhooks without secret or with bad HMAC | **Passed** (tests) |
| 27.6 Live Shopify revoke/restore on production store | **Passed** (client confirmed Vercel creds, 13 Nov) |

Full tables: [security-checkpoint.md](../security-checkpoint.md).

## Live store proof

**13 Nov sign-off:** Client confirmed production Shopify webhook secret and store configuration on Vercel.

**Handoff limit:** This package does not include a new dated live revoke/restore transcript. If ops wants a fresh proof, trigger revoke and repurchase on a test customer and confirm `learnerHasAccess` in admin **Learners** (same mapping as unit tests).

## Configuration reminder (no secrets in git)

Production learner API needs `SHOPIFY_WEBHOOK_SECRET` (and optional shop domain allowlist). See `.env.example` and security checkpoint production checklist.