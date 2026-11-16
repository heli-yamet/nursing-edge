# Security checkpoint (v5.1 Gates 26 and 27)

Friday **13 Nov 2026** closes the week-of-9-Nov security track. This is a **checkpoint**, not Developer Complete. Automated guards live in `src/tests/security-checkpoint.test.ts`, `player-question.test.ts`, `route-auth.test.ts`, `shopify-webhook.test.ts`, and `database-backup.test.ts`.

**Backup/restore ops (16 Nov):** Super Admin **Admin → Database** — Vercel Blob `backups/`, driver NDJSON export/import. Legacy `mongodump`/`mongorestore` scripts are optional engineering tools only. See [mongodb-backup.md](./mongodb-backup.md).

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
| 27.2 | Backup manifest and repeatable backup/restore. | [mongodb-backup.md](./mongodb-backup.md), Admin `database-backups` API, dev clone drill log | Passed |
| 27.3 | `ADMIN_SESSION_SECRET` and `LEARNER_SESSION_SECRET` documented for production. | `.env.example` | Passed (Vercel confirmed) |
| 27.4 | Admin API CORS reflects only `ADMIN_ORIGIN` (comma-separated list). | `admin-http.ts`, `security-checkpoint.test.ts` | Passed |
| 27.5 | Shopify webhooks reject requests when `SHOPIFY_WEBHOOK_SECRET` is unset or HMAC is invalid. | `gateShopifyWebhook`, `shopify-webhook.test.ts` | Passed |
| 27.6 | Live Shopify revoke and restore proof on the production store. | Vercel store credentials | Passed (client confirmed) |
| 27.7 | No MongoDB credentials or dumps in git. | `.gitignore` (`/backups/`, `.env*`), ops notes | Passed |
| 27.8 | Database backup/restore limited to Super Admin; Blob private; restore confirm by name. | `requireSuperAdmin`, `database-backup-runner.ts`, Admin UI | Passed |

## Production checklist (client / ops)

1. Set `MONGODB_URI`, `MONGODB_DB_NAME`, `ADMIN_SESSION_SECRET`, and `LEARNER_SESSION_SECRET` on **nursing-edge**.
2. Set `ADMIN_ORIGIN` on **nursing-edge** to the admin site URL.
3. Set `NEXT_PUBLIC_API_URL` on **nursing-edge-admin** to the learner API URL.
4. Shopify: `SHOPIFY_WEBHOOK_SECRET` (and optional store domain) on Vercel — verified by client.
5. Vercel Blob connected to **nursing-edge** for Admin backups.
6. Use **Admin → Database** for backup/restore; confirm `MONGODB_DB_NAME` before **Restore** (replaces live data).

## Test run (13 Nov 2026)

From `nursing-edge/`:

```bash
npx tsc --noEmit
npm test
```

**Expected:** full unit suite green except **two** `invariants.test.ts` delay cases (until **23 Nov**).

## Sign-off

| Area | Result |
| --- | --- |
| Gates 26–27 automated controls | Passed |
| Backup/restore (manifest + Admin Blob + dev drill) | Passed |
| Shopify live + Vercel env | Passed (client confirmed) |
| Developer Complete | Not this week |