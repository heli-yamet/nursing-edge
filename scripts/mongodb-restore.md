# MongoDB restore (Nursing Edge)

Step-by-step restore for dev drills and production recovery. Read [mongodb-environment.md](../docs/mongodb-environment.md) before any destructive work.

## Prerequisites

- `MONGODB_URI` and explicit `MONGODB_DB_NAME` for the **target** after restore.
- A backup: BSON folder from `npm run backup:mongo`, or a verified probe report from the same day.
- For BSON restores: [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools) (`mongorestore` on `PATH`).

## Success criterion (Review week)

After restore into a **clean** database name, a known learner keeps the same **ACTIVE** session, attempt counts on that session, Review cycle counts, and import staging row counts. The automated drill checks this via fingerprints (see below).

## Option A — Restore from `mongodump` (preferred for off-cluster archives)

1. Confirm the dump folder layout:

   ```
   backups/mongo-<source-db>-<timestamp>/
     <source-db>/<collection>.bson
     backup-run-report.json
   ```

2. Pick a **new** target database name (never overwrite production by mistake), e.g. `nursing-edge-restore-drill-2026-11-12`.

3. Restore:

   ```bash
   node scripts/mongo-restore-from-dump.mjs \
     --dump-dir ./backups/mongo-prod-2026-11-11T15-05-14-049Z \
     --target-db nursing-edge-restore-drill-2026-11-12
   ```

   Add `--source-db prod` if the folder’s database directory name differs from your current `MONGODB_DB_NAME`.

4. Recreate indexes (without starting the Next.js app):

   ```bash
   npm run restore:indexes -- --db nursing-edge-restore-drill-2026-11-12
   ```

5. Verify fingerprints:

   ```bash
   node scripts/mongo-restore-fingerprint.mjs --db <source> --out ./source.json
   node scripts/mongo-restore-fingerprint.mjs --db <target> --out ./restored.json
   node scripts/mongo-restore-verify.mjs --before ./source.json --after ./restored.json
   ```

## Option B — Same-cluster dev drill (no Database Tools)

When `mongodump` is not installed, clone manifest collections on the same cluster, then verify the same way:

```bash
npm run restore:drill -- --target-db nursing-edge-restore-drill-2026-11-12
```

This runs: source fingerprint → `mongo-clone-database.mjs` → index harness → target fingerprint → compare. Output lives under `backups/restore-drill-<timestamp>/` (gitignored).

Large databases may take several minutes to clone. If clone finishes but indexes time out, resume:

```bash
npm run restore:drill -- --target-db nursing-edge-restore-drill-2026-11-12 \
  --resume-dir ./backups/restore-drill-<timestamp> --skip-clone
```

Optional: set `MONGO_CLONE_USE_OUT=1` when Atlas allows cross-database `$out` (many developer roles do not).

To restore from BSON when tools are available:

```bash
node scripts/mongo-restore-drill.mjs \
  --target-db nursing-edge-restore-drill-2026-11-12 \
  --dump-dir ./backups/mongo-prod-...
```

## Pointing the app at a restored database

Only for local verification:

1. Set `MONGODB_DB_NAME` in `.env.local` to the target database.
2. Do **not** run destructive imports while pointed at the wrong name.
3. Revert to your dev database name when finished.

Production cutover is a hosting/ops decision (Vercel env vars, maintenance window). This repo documents mechanics, not cutover policy.

## After restore

- Relationship and learner indexes are idempotent; running the index harness or one API `getDb()` call is sufficient.
- Drop drill databases when done: Atlas UI, or let `mongo-clone-database.mjs` drop collections on the next drill (Atlas users often lack `dropDatabase`).

## Never

- `mongorestore --drop` against production without a written ops check (`MONGODB_DB_NAME`, backup file, maintenance window).
- Commit `backups/`, fingerprint JSON, or drill reports that contain real learner identifiers to git.

## Verification log

| Date | Method | Result |
| --- | --- | --- |
| 2026-11-12 | `restore:drill` (driver clone) | Passed on dev cluster: source `prod`, target `nursing-edge-restore-drill-2026-11-12`, verification `passed` (~77s resume step after clone). See `restore-run-proof.example.json`; live report under `backups/restore-drill-*` |
