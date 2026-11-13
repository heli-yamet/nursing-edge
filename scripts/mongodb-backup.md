# MongoDB backup (Nursing Edge)

Repeatable backup of learner evidence, content, relationship registries, and admin audit collections. Uses the same database resolution as the app (`MONGODB_DB_NAME`, then URI path, then legacy `prod`). See [mongodb-environment.md](../docs/mongodb-environment.md) before touching production.

## Prerequisites

1. `MONGODB_URI` and `MONGODB_DB_NAME` in `nursing-edge/.env.local` (or exported in the shell).
2. [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools) (`mongodump` on `PATH`, or default Windows install under `Program Files\MongoDB\Tools`).
3. Confirm the resolved database name is **not** production when running from a laptop (see environment doc).

## What is backed up

Collection list and retention guidance live in [mongo-backup-manifest.json](./mongo-backup-manifest.json). Categories:

| Category | Examples |
| --- | --- |
| Admin identity | `admin_users`, `admin_users_codes` |
| Learner access | `learners`, `entitlements`, `access_grant_audits` |
| Learner evidence | `sessions`, `attempts`, `review_cycles`, `calibrations` |
| Content | `questions`, `question_versions`, `import_batches` |
| Relationships | `maps`, `transfer_links`, `support_links`, `runtime_roles` |
| Content audit | `publish_audits`, `export_audits` |

Each backup run copies the manifest into the output folder and writes `backup-run-report.json` (counts, timing, size). **Do not commit** `backups/` or reports that contain real learner data.

## Run a backup

From `nursing-edge/`:

```bash
node scripts/mongo-backup.mjs
```

Optional output directory:

```bash
node scripts/mongo-backup.mjs --output-dir ./backups/manual-run
```

### Probe only (no mongodump)

Useful to verify connectivity, database name, and collection counts:

```bash
node scripts/mongo-backup.mjs --probe-only
```

## Output layout

```
nursing-edge/backups/mongo-<db-name>-<timestamp>/
  mongo-backup-manifest.json
  backup-run-report.json
  <db-name>/
    <collection>.bson
    <collection>.metadata.json
```

## Retention (summary)

- **Development:** up to 14 timestamped folders under `backups/`; delete older dumps with learner PII.
- **Production:** at least 30 days off-cluster encrypted storage; complement Atlas backup if the cluster has it.

Adjust per client ops policy; the manifest `retention_expectation` block is the canonical wording.

## Restore

Full step-by-step restore and dev drill: [mongodb-restore.md](./mongodb-restore.md).

Quick dev drill (same cluster, no `mongodump` required):

```bash
npm run restore:drill -- --target-db nursing-edge-restore-drill-YYYY-MM-DD
```

## Destructive work warning

Never `mongorestore --drop` or run content imports against production without verifying `MONGODB_DB_NAME` and the backup file target.

## Verification log

| Date | Mode | Result |
| --- | --- | --- |
| 2026-11-11 | `--probe-only` | 43 manifest collections found (0 missing); ~37–40s connect and count pass. `mongodump` not on PATH on this machine — install [Database Tools](https://www.mongodb.com/try/download/database-tools) for BSON dumps and `dump_bytes` in the report. |
| 2026-11-12 | `restore:drill` | Driver clone `prod` → `nursing-edge-restore-drill-2026-11-12` (~18 min clone + ~39s indexes); fingerprint verify passed (1 ACTIVE session, 12 import batches). Resume: `--resume-dir` + `--skip-clone`. BSON path: `mongo-restore-from-dump.mjs` when Database Tools are installed. |

Safe report shape (no PII): [backup-run-proof.example.json](./backup-run-proof.example.json). Live reports stay under `backups/` only.
