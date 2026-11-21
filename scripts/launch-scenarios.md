# Launch scenarios gate (Fri 20 Nov 2026)

Friday closes the **week of 16 Nov** accessibility track and runs the **pre–Developer Complete launch scenario pass** from the overall project plan (trace via tests and code; staging only when the client requests a deployed walkthrough). This is **not** Developer Complete (target **Wed 25 Nov**).

Automated anchors: `src/tests/launch-scenarios.test.ts`, plus the suites cited below. Suites live in `nursing-edge/src/tests/` (local/CI only; path is in `.gitignore`). Apps stay stopped unless the client explicitly asks for staging.

## Scenario results

| # | Thread | How verified | Result |
| --- | --- | --- | --- |
| 1 | **Paid or manual grant allows registration and access** | `learner-account.test.ts` (`registrationGate`, `learnerHasAccess`, manual grant + Shopify ACTIVE); `grant-invitation.test.ts` | **Passed** |
| 2 | **Revoked access blocks app entry** | `learnerHasAccess` with `REVOKED`; `practice-session.test.ts` and `calibration-session.test.ts` (`not_authorized`); pages use `requireAuthorizedLearner` → `/account` when access is false (`learner-gate.ts`) | **Passed** |
| 3 | **Learner completes Practice commit flow** | `commit-answer.test.ts`, `session-draft.test.ts`, `end-session.test.ts`, `player-question.test.ts`, `player-load.test.ts` | **Passed** |
| 4 | **Review opens from due state** | `review-session.test.ts` (`startReviewSession`, `previewDueReview`, due window rules); `review-outlook.test.ts` | **Passed** |
| 5 | **Admin Overview and Learning Evidence are read-only** | `overview/route.ts` and `learning-evidence/route.ts` export **GET** only; `learning-evidence.test.ts`; export omits answer keys (`admin-audit.test.ts`) | **Passed** |
| 6 | **After backup and restore, the same Active session resumes** | Dev clone drill `backups/restore-drill-2026-11-12T21-16-38-970Z/` — `restore-drill-report.json` `verification: passed`; `mongo-restore-verify.mjs` matches source/restored fingerprints (1 ACTIVE session, attempt totals, Review cycles, import staging). Operator path: **Admin → Database** ([mongodb-restore.md](./mongodb-restore.md)) | **Passed** |
| 7 | **Pre-commit payloads omit answer key and rationales** | `player-question.test.ts`, `player-load.test.ts`, `security-checkpoint.test.ts` | **Passed** |
| 8 | **Shopify webhook revoke / restore mapping** | `shopify-webhook.test.ts` (ACTIVE, REVOKED, reconcile on repaid) | **Passed** (unit); live store proof tracked in [security-checkpoint.md](./security-checkpoint.md) |

## Test run (20 Nov 2026)

Command: `npm test` in `nursing-edge`.

| Outcome | Detail |
| --- | --- |
| **412 tests** | **405 passed**, **7 failed** (unchanged from prior weeks) |
| Expected failures | **2** × `invariants.test.ts` Repair **24h** and Confirmation **72h** delays (reset scheduled **Mon 23 Nov** per overall plan) |
| Local workbook skips | **5** × missing R7/C2 `.xlsx` on this machine (`relationship-import*.test.ts`, `c2-parse.test.ts`, `relationship-import-volume.test.ts`) |

Launch-critical suites (access, Practice/Review session, commit, restore manifest, route auth, checkpoint) are green.

## Fixes this Friday

None required. Scenario pass is code-and-test traced only; no product behavior changes.

## Open for Mon 23 – Wed 25 Nov (Developer Complete)

1. Reset Review test delays to **24h Repair** and **72h Confirmation** (`invariants.test.ts` and related clock expectations).
2. End-to-end walkthrough on one release commit (document 05 scenarios) when staging is available.
3. Package: eligibility report, test report, Shopify proof, mobile and accessibility notes (`scripts/accessibility-*.md`), security checklist, restore proof, sample export, known limits.
4. Optional manual **390px** spot-check on staging (Practice submit, Review commit, admin import upload) — noted in [accessibility-contrast-mobile.md](./accessibility-contrast-mobile.md).

## Related runbooks

- [security-checkpoint.md](./security-checkpoint.md) — Gates 26–27 (closed 13 Nov)
- [mongodb-backup.md](./mongodb-backup.md) / [mongodb-restore.md](./mongodb-restore.md) — Admin Blob backup and restore
- [accessibility-keyboard-focus.md](./accessibility-keyboard-focus.md), [accessibility-screen-reader.md](./accessibility-screen-reader.md), [accessibility-contrast-mobile.md](./accessibility-contrast-mobile.md)

**Gate status (20 Nov):** Launch scenario threads **passed** on automated evidence. **Developer Complete:** not yet.