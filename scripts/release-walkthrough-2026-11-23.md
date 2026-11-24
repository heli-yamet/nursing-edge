# Release walkthrough anchor — Mon 23 Nov 2026

Developer Complete walkthrough uses one aligned triple of commits across the three deployables. Record SHAs here after the Monday delay reset lands.

| App | Repository | Role | Commit (fill after push) |
| --- | --- | --- | --- |
| Learner | `nursing-edge` | 24h Repair, 72h Confirmation, 14-day active window | `e1d0444` |
| Admin | `nursing-edge-admin` | No Monday code change expected | `6e5eac7` (pre-walkthrough baseline) |
| Status | `nursing-edge-status` | Changelog 0.0.34 when shipped | _pending — commit blocked locally (index permissions); file staged in working tree_ |

## What to verify on staging (when access is available)

1. Paid or manual grant → learner can open Practice and Review.
2. Revoked grant → redirect to `/account`; Practice and Review APIs return `not_authorized`.
3. Practice commit → six-state choice opens Repair or Confirmation cycle with due times consistent with policy (spot-check labels and Review queue, not wall-clock wait).
4. Due Review → learner can start session; pre-commit player omits answer key and rationales.
5. Admin Overview and Learning Evidence → read-only (no POST).
6. Backup/restore drill or operator acknowledgment per `mongodb-restore.md`.
7. Shopify webhook unit mapping documented; live revoke/restore if creds ready.

Until staging runs, treat `launch-scenarios.md` scenario table plus **23–24 Nov** `npm test` (**417 passed**, 0 failed on Charles machine with workbooks) as walkthrough evidence. Handoff: [developer-complete-handoff/README.md](./developer-complete-handoff/README.md).