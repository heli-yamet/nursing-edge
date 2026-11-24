# Restore proof

## Success criterion

After restore, a known learner should resume the same **ACTIVE** session (when restoring the same database), with matching attempt totals, Review cycle counts, and import staging counts.

## Dev clone drill (engineer path)

| Date | Method | Result |
| --- | --- | --- |
| **2026-11-12** | `npm run restore:drill` (driver clone to separate DB) | **`verification: passed`** |

Live artifacts live under `nursing-edge/backups/restore-drill-*` (gitignored). Shape reference: [restore-run-proof.example.json](../restore-run-proof.example.json).

Launch scenario **#6** cites drill `backups/restore-drill-2026-11-12T21-16-38-970Z/` with fingerprint match via `mongo-restore-verify.mjs`.

## Production operator path

**Super Admin → Admin → Database** — Vercel Blob backup list, confirm-by-name restore. Documented in [mongodb-restore.md](../mongodb-restore.md) and [mongodb-backup.md](../mongodb-backup.md).

| Date | Method | Result |
| --- | --- | --- |
| **2026-11-16** | Admin Blob restore documented | Canonical ops path; Gate **27.2** |

## What this package does not include

No new drill folder or production restore log for 24 Nov (would contain learner identifiers). Re-run drill locally or Blob restore on staging when the client requests fresh evidence.

## Legacy scripts

Optional same-cluster clone and deprecated BSON restore paths remain in `mongodb-restore.md` for engineering only; ops should prefer Admin Blob.