# MongoDB restore (Nursing Edge)

Step-by-step restore for production recovery and dev drills. Read [mongodb-environment.md](../docs/mongodb-environment.md) before any destructive work.

## Primary method — Admin UI (Super Admin)

1. Sign in as **SUPER_ADMIN** → **Database** → **Restore database**.
2. Select a Blob backup (double-click or select + Continue).
3. **Confirm restore:** type the **exact backup name**.
4. Wait for the progress overlay (validate → collections → indexes).

**Effect:** Replaces data in the MongoDB database configured on the **learner API** (`MONGODB_DB_NAME` on that deployment). Works on production when env is set correctly. Only one backup/restore job runs at a time.

**Validation before write:** `report.json` and every `data/{collection}.ndjson` must exist; document counts must match after each collection import.

## Success criterion (security week)

After restore, a known learner keeps the same **ACTIVE** session (when restoring the same DB), attempt counts, Review cycle counts, and import staging counts. Admin restore targets the live DB; dev drills below use a **separate** database name.

## Legacy — same-cluster dev drill (optional)

Clone manifest collections on the **same cluster** into a new database name (no Blob file):

```bash
cd nursing-edge
npm run restore:drill -- --target-db nursing-edge-restore-drill-YYYY-MM-DD
```

Runs fingerprint → `mongo-clone-database.mjs` → indexes → compare. Reports under `backups/restore-drill-*` (gitignored).

Resume after clone:

```bash
npm run restore:drill -- --target-db <name> \
  --resume-dir ./backups/restore-drill-<timestamp> --skip-clone
```

## Legacy — BSON `mongorestore` (deprecated for ops)

Superseded by Admin Blob restore. Requires MongoDB Database Tools. Only if you still have an old `backups/mongo-*` folder:

```bash
node scripts/mongo-restore-from-dump.mjs \
  --dump-dir ./backups/mongo-... \
  --target-db <target-db>
npm run restore:indexes -- --db <target-db>
```

## Pointing the app at a drill database (local only)

1. Set `MONGODB_DB_NAME` in `.env.local` to the drill target.
2. Revert when finished.

## Never

- Restore production without confirming **`MONGODB_DB_NAME`** on the learner API Vercel project.
- Commit `backups/`, fingerprint JSON, or drill reports with learner identifiers to git.

## Verification log

| Date | Method | Result |
| --- | --- | --- |
| 2026-11-12 | `restore:drill` (driver clone) | Passed: verification `passed`. |
| 2026-11-16 | Admin Blob restore | Documented; canonical operator path alongside checkpoint 27.2. |