# MongoDB backup (Nursing Edge)

Repeatable backup of learner evidence, content, relationship registries, and admin audit collections. Uses the same database resolution as the app (`MONGODB_DB_NAME`, then URI path, then legacy `prod`). See [mongodb-environment.md](../docs/mongodb-environment.md) before touching production.

## Primary method — Admin UI (Super Admin)

**No MongoDB Database Tools.** No laptop folder or PATH setup.

1. Sign in to **Nursing Edge Admin** as **SUPER_ADMIN**.
2. Open **Database**.
3. **Backup database** → pick or enter a backup name (default `backup_<db>_<timestamp>`; selecting an existing name overwrites that archive).
4. Wait for the progress overlay to reach 100%.

**Storage:** private Vercel Blob prefix `backups/{name}/`:

- `meta.json`, `report.json` (counts, format version)
- `data/{collection}.ndjson` (EJSON, one line per document)

**API** (learner app): `requireSuperAdmin` on `app/api/admin/database-backups/*`. Implementation: `src/lib/database-backup-runner.ts`.

**Retention:** manage named backups from the restore list; delete old archives in Blob when no longer needed (Atlas continuous backup remains the cluster safety net if enabled).

## Manifest

Collection list and retention guidance: [mongo-backup-manifest.json](./mongo-backup-manifest.json). The admin backup uses the same 43 collections.

| Category | Examples |
| --- | --- |
| Admin identity | `admin_users`, `admin_users_codes` |
| Learner access | `learners`, `entitlements`, `access_grant_audits` |
| Learner evidence | `sessions`, `attempts`, `review_cycles`, `calibrations` |
| Content | `questions`, `question_versions`, `import_batches` |
| Relationships | `maps`, `transfer_links`, `support_links`, `runtime_roles` |
| Content audit | `publish_audits`, `export_audits` |

`database_backup_jobs` is operational metadata and is **not** included in backups.

## Legacy — local scripts (optional)

For engineering only (connectivity check or same-cluster drills). **Operators should use Admin → Database.**

### Probe (counts only)

```bash
cd nursing-edge
npm run backup:mongo:probe
```

### BSON folder (`mongodump`)

Requires [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools) on `PATH`. Superseded by Admin Blob backup for production ops.

```bash
npm run backup:mongo
```

Output under `nursing-edge/backups/` (gitignored). **Do not commit** dumps or reports with learner PII.

## Restore

See [mongodb-restore.md](./mongodb-restore.md). Production restore: **Admin → Database → Restore** (type backup name to confirm).

## Destructive work warning

Never run **Restore** in Admin or legacy restore scripts without confirming the learner API’s **`MONGODB_DB_NAME`** on Vercel (or `.env.local`) is the database you intend to replace.

## Verification log

| Date | Mode | Result |
| --- | --- | --- |
| 2026-11-11 | `--probe-only` | 43 manifest collections found (0 missing); ~37–40s connect and count pass. |
| 2026-11-12 | `restore:drill` | Driver clone + fingerprint verify passed. |
| 2026-11-16 | Admin Blob | Super Admin backup/restore documented; driver export/import replaces BSON for operators. |

Safe report shape (no PII): [backup-run-proof.example.json](./backup-run-proof.example.json).