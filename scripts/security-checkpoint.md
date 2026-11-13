# Security checkpoint (v5.1 Gates 26 and 27)

Friday **13 Nov 2026** closes the week-of-9-Nov security track. This is a **checkpoint**, not Developer Complete. Automated guards live in `src/tests/security-checkpoint.test.ts`, `player-question.test.ts`, `route-auth.test.ts`, and `shopify-webhook.test.ts`.

## Gate 26 — learner isolation and pre-commit protection

| # | Control | Evidence | Status |
| --- | --- | --- | --- |
| 26.1 | Learner and operator data paths are separate (admin Bearer token vs learner cookie / token). | `requireActiveAdmin`, `learnerFromToken`, `route-auth.test.ts` | Passed |
| 26.2 | Sensitive admin APIs require an active admin. | All `app/api/admin/*` routes except sign-in/up/check-email | Passed |
| 26.3 | Learner session APIs bind work to the authenticated learner, not body-supplied ids. | `route-auth.test.ts` | Passed |
| 26.4 | Pre-commit player JSON omits answer keys, rationales, and post-commit teaching. | `toPreCommitQuestion`, `player-question.test.ts`, `player-load.test.ts` | Passed |
| 26.5 | Post-commit reveal is only on the commit path. | `commit-answer.test.ts` | Passed |
| 26.6 | Admin export and audit views omit answer keys (pseudonymous export). | `learner-export` route, `admin-audit.test.ts` | Passed |
| 26.7 | Production session cookies use `Secure` (HTTPS). | `learnerCookieOptions` in `learner-session.ts`; Vercel serves HTTPS only | Passed (hosting) |

## Gate 27 — operations, data, and integrations

| # | Control | Evidence | Status |
| --- | --- | --- | --- |
| 27.1 | Dev and production MongoDB names are explicit and documented. | `MONGODB_DB_NAME`, [mongodb-environment.md](../docs/mongodb-environment.md), `mongo-db-name.test.ts` | Passed |
| 27.2 | Backup manifest and dev probe / restore drill recorded. | [mongodb-backup.md](./mongodb-backup.md), [mongodb-restore.md](./mongodb-restore.md) verification logs | Passed (dev drill) |
| 27.3 | `ADMIN_SESSION_SECRET` and `LEARNER_SESSION_SECRET` documented for production. | `.env.example` | Passed (configure on Vercel) |
| 27.4 | Admin API CORS reflects only `ADMIN_ORIGIN` (comma-separated list). | `admin-http.ts`, `security-checkpoint.test.ts` | Passed |
| 27.5 | Shopify webhooks reject requests when `SHOPIFY_WEBHOOK_SECRET` is unset or HMAC is invalid. | `gateShopifyWebhook`, `shopify-webhook.test.ts` | Passed |
| 27.6 | Live Shopify revoke and restore proof on the production store. | Requires store owner credentials in Vercel | **Deferred** — `SHOPIFY_WEBHOOK_SECRET` / store domain not provided for live drill |
| 27.7 | No MongoDB credentials or dumps in git. | `.gitignore` (`/backups/`, `.env*`), ops notes | Passed |

## Production checklist (client / ops)

Before treating production as live:

1. Set `MONGODB_URI`, `MONGODB_DB_NAME`, `ADMIN_SESSION_SECRET`, and `LEARNER_SESSION_SECRET` on the **nursing-edge** Vercel project.
2. Set `ADMIN_ORIGIN` to the deployed admin site origin (production URL, no wildcard).
3. Set `NEXT_PUBLIC_API_URL` on **nursing-edge-admin** to the learner API production URL.
4. When Shopify is ready: set `SHOPIFY_WEBHOOK_SECRET`, optionally `SHOPIFY_STORE_DOMAIN`, run one paid and one revoke webhook in a staging shop or production with verification in entitlements.
5. Never run `mongorestore --drop` or a full content import against production without confirming `MONGODB_DB_NAME` on the machine running the command.

## Test run (13 Nov 2026)

Run from `nursing-edge/`:

```bash
npx tsc --noEmit
npm test
```

**Expected:** full unit suite green except **two** cases in `invariants.test.ts` (compressed Review delays until **23 Nov**). Typecheck should pass with no errors.

**Recorded 13 Nov 2026:** `npx tsc --noEmit` passed. `npm test`: 398 passed, 7 failed — **2** expected `invariants.test.ts` delay cases; **5** workbook file fixtures missing locally (`ENOENT` under `Nursing_Edge_Workbooks/current` or `resources/`). Security checkpoint tests (7) and route-auth tests passed.

## Sign-off

| Area | Result |
| --- | --- |
| Gates 26–27 automated controls | Passed |
| Dev backup probe + restore drill | Passed (see backup/restore verification logs) |
| Shopify live revoke/restore | Deferred pending store credentials |
| Developer Complete | Not this week |
