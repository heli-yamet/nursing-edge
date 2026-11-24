# Security checklist — Gates 26 and 27

**Checkpoint closed:** Fri **13 Nov 2026**. Developer Complete re-affirms automated controls; no new security scope this week.

Authoritative detail: [security-checkpoint.md](../security-checkpoint.md). Guards: `security-checkpoint.test.ts`, `route-auth.test.ts`, `player-question.test.ts`, `shopify-webhook.test.ts`, `database-backup.test.ts`.

## Gate 26 — learner isolation and pre-commit

| # | Control | Handoff status |
| --- | --- | --- |
| 26.1 | Separate admin vs learner auth paths | **Passed** |
| 26.2 | Admin APIs require active admin | **Passed** |
| 26.3 | Learner APIs bind to session learner id | **Passed** |
| 26.4 | Pre-commit player omits keys and rationales | **Passed** |
| 26.5 | Post-commit reveal only on commit path | **Passed** |
| 26.6 | Admin export omits answer keys (pseudonymous) | **Passed** — see [learner-export-sample.example.json](./learner-export-sample.example.json) |
| 26.7 | Secure session cookies on HTTPS | **Passed** (Vercel) |

## Gate 27 — operations and integrations

| # | Control | Handoff status |
| --- | --- | --- |
| 27.1 | Explicit MongoDB database names | **Passed** |
| 27.2 | Backup manifest + Admin Blob + drill | **Passed** — [restore-proof.md](./restore-proof.md) |
| 27.3 | Session secrets documented | **Passed** (Vercel) |
| 27.4 | Admin CORS limited to `ADMIN_ORIGIN` | **Passed** |
| 27.5 | Shopify HMAC gate | **Passed** |
| 27.6 | Live Shopify proof | **Passed** (client 13 Nov) |
| 27.7 | No credentials/dumps in git | **Passed** |
| 27.8 | Backup/restore Super Admin only | **Passed** |

## 24 Nov regression

Full `npm test`: **417/417** green, including `security-checkpoint.test.ts` (7) and `route-auth.test.ts` (3).

## Production ops checklist (client)

Unchanged from security checkpoint — set MongoDB, both session secrets, `ADMIN_ORIGIN`, `NEXT_PUBLIC_API_URL`, Shopify webhook secret, Vercel Blob; use **Admin → Database** for restore with name confirmation.