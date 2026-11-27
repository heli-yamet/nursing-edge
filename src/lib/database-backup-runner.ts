import { del, get, list, put } from "@vercel/blob";
import { EJSON } from "bson";
import type { Db } from "mongodb";
import {
  BACKUP_FORMAT_VERSION,
  backupCollectionDataPath,
  backupMetaPath,
  backupPrefixForName,
  backupReportPath,
  defaultBackupName,
  isValidBackupName,
  DATABASE_BACKUP_BLOB_PREFIX,
} from "@/lib/database-backup-blob";
import {
  backupCollectionNames,
  backupManifestVersion,
} from "@/lib/database-backup-manifest";
import {
  createDatabaseBackupJob,
  getDatabaseBackupJob,
  getRunningDatabaseBackupJob,
  updateDatabaseBackupJob,
  type DatabaseBackupJob,
} from "@/lib/database-backup-job";
import { ensureAllSchemaIndexes, getDb } from "@/lib/mongo";
import { resolveMongoDbName } from "@/lib/mongo-db-name";

const INSERT_BATCH = 500;

export type StoredBackupSummary = {
  backup_name: string;
  database: string;
  created_at: string;
  collection_count: number;
  document_count: number;
};

export async function listStoredBackups(): Promise<StoredBackupSummary[]> {
  const { blobs } = await list({
    prefix: DATABASE_BACKUP_BLOB_PREFIX,
    limit: 1000,
  });
  const metaPaths = blobs
    .map((blob) => blob.pathname)
    .filter((pathname) => pathname.endsWith("/meta.json"));

  const summaries: StoredBackupSummary[] = [];
  for (const pathname of metaPaths) {
    const match = pathname.match(/^backups\/([^/]+)\/meta\.json$/);
    if (!match) {
      continue;
    }
    const backup_name = match[1];
    if (!isValidBackupName(backup_name)) {
      continue;
    }
    try {
      const downloaded = await get(pathname, { access: "public", useCache: false });
      if (!downloaded || downloaded.statusCode !== 200) {
        continue;
      }
      const text = await new Response(downloaded.stream).text();
      const meta = JSON.parse(text) as {
        database?: string;
        created_at?: string;
        collection_stats?: { document_count: number }[];
      };
      const stats = meta.collection_stats ?? [];
      summaries.push({
        backup_name,
        database: String(meta.database ?? ""),
        created_at: String(meta.created_at ?? ""),
        collection_count: stats.length,
        document_count: stats.reduce((sum, row) => sum + row.document_count, 0),
      });
    } catch {
      // skip unreadable backup
    }
  }

  return summaries.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function deleteBackupBlobs(backupName: string): Promise<void> {
  const prefix = backupPrefixForName(backupName);
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const blob of page.blobs) {
      await del(blob.url);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

async function exportCollection(db: Db, name: string): Promise<{
  ndjson: string;
  document_count: number;
}> {
  const cursor = db.collection(name).find({});
  const lines: string[] = [];
  let document_count = 0;
  for await (const doc of cursor) {
    lines.push(`${EJSON.stringify(doc)}\n`);
    document_count += 1;
  }
  return { ndjson: lines.join(""), document_count };
}

async function advanceBackupJob(job: DatabaseBackupJob): Promise<DatabaseBackupJob> {
  const db = await getDb();
  const total = job.collections.length;
  const index = job.collection_index;

  if (index < total) {
    if (index === 0) {
      await deleteBackupBlobs(job.backup_name);
    }
    const collection = job.collections[index];
    await updateDatabaseBackupJob(job.job_id, {
      message: `Backing up ${collection}…`,
      percent: Math.min(99, Math.round((index / total) * 100)),
    });

    const { ndjson, document_count } = await exportCollection(db, collection);
    await put(backupCollectionDataPath(job.backup_name, collection), ndjson, {
      access: "private",
      allowOverwrite: true,
      contentType: "application/x-ndjson",
    });

    const collection_stats = [...job.collection_stats, { collection, document_count }];
    const nextIndex = index + 1;
    const percent = Math.min(99, Math.round((nextIndex / total) * 100));

    if (nextIndex < total) {
      const updated = await updateDatabaseBackupJob(job.job_id, {
        collection_index: nextIndex,
        collection_stats,
        percent,
        message: `Backed up ${collection} (${document_count} documents).`,
      });
      return updated ?? job;
    }

    const created_at = new Date().toISOString();
    const meta = {
      format_version: BACKUP_FORMAT_VERSION,
      backup_name: job.backup_name,
      database: job.database_name,
      created_at,
      manifest_version: backupManifestVersion(),
      collections: job.collections,
      collection_stats,
    };
    const report = {
      format_version: BACKUP_FORMAT_VERSION,
      backup_name: job.backup_name,
      database: job.database_name,
      created_at,
      collection_stats,
      manifest_version: backupManifestVersion(),
    };

    await put(backupMetaPath(job.backup_name), JSON.stringify(meta, null, 2), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
    });
    await put(backupReportPath(job.backup_name), JSON.stringify(report, null, 2), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
    });

    const finished = await updateDatabaseBackupJob(job.job_id, {
      collection_index: nextIndex,
      collection_stats,
      percent: 100,
      message: "Backup complete.",
      status: "completed",
      finished_at: created_at,
    });
    return finished ?? job;
  }

  return job;
}

type BackupReport = {
  format_version: number;
  collection_stats: { collection: string; document_count: number }[];
  collections?: string[];
};

async function loadBackupReport(backupName: string): Promise<BackupReport> {
  const downloaded = await get(backupReportPath(backupName), {
    access: "private",
    useCache: false,
  });
  if (!downloaded || downloaded.statusCode !== 200) {
    throw new Error("Backup report is missing or unreadable.");
  }
  const report = JSON.parse(
    await new Response(downloaded.stream).text(),
  ) as BackupReport;
  if (report.format_version !== BACKUP_FORMAT_VERSION) {
    throw new Error("Unsupported backup format version.");
  }
  if (!Array.isArray(report.collection_stats) || report.collection_stats.length === 0) {
    throw new Error("Backup report has no collection statistics.");
  }
  return report;
}

async function validateBackupBlobs(
  backupName: string,
  report: BackupReport,
): Promise<void> {
  for (const row of report.collection_stats) {
    const path = backupCollectionDataPath(backupName, row.collection);
    const downloaded = await get(path, { access: "private", useCache: false });
    if (!downloaded || downloaded.statusCode !== 200) {
      throw new Error(`Backup file missing for collection ${row.collection}.`);
    }
    await new Response(downloaded.stream).text();
  }
}

async function importCollection(
  db: Db,
  collection: string,
  ndjson: string,
): Promise<number> {
  await db.collection(collection).deleteMany({});
  const lines = ndjson.split("\n").filter((line) => line.trim().length > 0);
  let inserted = 0;
  let batch: Record<string, unknown>[] = [];

  const flush = async () => {
    if (batch.length === 0) {
      return;
    }
    await db.collection(collection).insertMany(batch);
    inserted += batch.length;
    batch = [];
  };

  for (const line of lines) {
    const doc = EJSON.parse(line) as Record<string, unknown>;
    batch.push(doc);
    if (batch.length >= INSERT_BATCH) {
      await flush();
    }
  }
  await flush();
  return inserted;
}

async function advanceRestoreJob(job: DatabaseBackupJob): Promise<DatabaseBackupJob> {
  const db = await getDb();
  const total = job.collections.length;
  const index = job.collection_index;

  if (index === 0 && job.collection_stats.length === 0) {
    await updateDatabaseBackupJob(job.job_id, {
      message: "Validating backup…",
      percent: 1,
    });
    const report = await loadBackupReport(job.backup_name);
    await validateBackupBlobs(job.backup_name, report);
    const updated = await updateDatabaseBackupJob(job.job_id, {
      collection_stats: report.collection_stats,
      message: "Backup validated.",
      percent: 2,
    });
    return updated ?? job;
  }

  if (index < total) {
    const collection = job.collections[index];
    const expected = job.collection_stats.find((row) => row.collection === collection);
    await updateDatabaseBackupJob(job.job_id, {
      message: `Restoring ${collection}…`,
      percent: Math.min(98, Math.round((index / total) * 100)),
    });

    const downloaded = await get(backupCollectionDataPath(job.backup_name, collection), {
      access: "private",
      useCache: false,
    });
    if (!downloaded || downloaded.statusCode !== 200) {
      throw new Error(`Backup data missing for ${collection}.`);
    }
    const ndjson = await new Response(downloaded.stream).text();
    const inserted = await importCollection(db, collection, ndjson);
    if (expected && inserted !== expected.document_count) {
      throw new Error(
        `Restore count mismatch for ${collection}: expected ${expected.document_count}, got ${inserted}.`,
      );
    }

    const nextIndex = index + 1;
    const percent = Math.min(98, Math.round((nextIndex / total) * 100));
    if (nextIndex < total) {
      const updated = await updateDatabaseBackupJob(job.job_id, {
        collection_index: nextIndex,
        percent,
        message: `Restored ${collection} (${inserted} documents).`,
      });
      return updated ?? job;
    }

    await updateDatabaseBackupJob(job.job_id, {
      collection_index: nextIndex,
      percent: 99,
      message: "Recreating indexes…",
    });
    await ensureAllSchemaIndexes(db);

    const finished_at = new Date().toISOString();
    const finished = await updateDatabaseBackupJob(job.job_id, {
      percent: 100,
      message: "Restore complete.",
      status: "completed",
      finished_at,
    });
    return finished ?? job;
  }

  return job;
}

export async function startBackupJob(input: {
  backup_name: string;
  started_by_admin_id: string;
  started_by_email: string;
}): Promise<DatabaseBackupJob> {
  if (!isValidBackupName(input.backup_name)) {
    throw new Error("Invalid backup name.");
  }
  const uri = process.env.MONGODB_URI ?? "";
  const database_name = resolveMongoDbName(uri);
  const collections = backupCollectionNames();
  return createDatabaseBackupJob({
    kind: "backup",
    backup_name: input.backup_name,
    database_name,
    collections,
    started_by_admin_id: input.started_by_admin_id,
    started_by_email: input.started_by_email,
  });
}

export async function startRestoreJob(input: {
  backup_name: string;
  confirm_name: string;
  started_by_admin_id: string;
  started_by_email: string;
}): Promise<DatabaseBackupJob> {
  if (!isValidBackupName(input.backup_name)) {
    throw new Error("Invalid backup name.");
  }
  if (input.confirm_name.trim() !== input.backup_name.trim()) {
    throw new Error("Confirmation name does not match the selected backup.");
  }

  const report = await loadBackupReport(input.backup_name);
  await validateBackupBlobs(input.backup_name, report);

  const uri = process.env.MONGODB_URI ?? "";
  const database_name = resolveMongoDbName(uri);
  const collections = report.collection_stats.map((row) => row.collection);

  const job = await createDatabaseBackupJob({
    kind: "restore",
    backup_name: input.backup_name,
    database_name,
    collections,
    started_by_admin_id: input.started_by_admin_id,
    started_by_email: input.started_by_email,
  });
  await updateDatabaseBackupJob(job.job_id, {
    collection_stats: report.collection_stats,
  });
  const refreshed = await getDatabaseBackupJob(job.job_id);
  return refreshed ?? job;
}

export async function advanceDatabaseBackupJob(
  jobId?: string,
): Promise<DatabaseBackupJob | null> {
  const job = jobId
    ? await getDatabaseBackupJob(jobId)
    : await getRunningDatabaseBackupJob();
  if (!job || job.status !== "running") {
    return job;
  }

  try {
    if (job.kind === "backup") {
      return await advanceBackupJob(job);
    }
    return await advanceRestoreJob(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "job_failed";
    await updateDatabaseBackupJob(job.job_id, {
      status: "failed",
      error: message,
      message: `Failed: ${message}`,
      finished_at: new Date().toISOString(),
    });
    return getDatabaseBackupJob(job.job_id);
  }
}

export function defaultBackupNameForEnv(): string {
  const uri = process.env.MONGODB_URI ?? "";
  const database_name = resolveMongoDbName(uri);
  return defaultBackupName(database_name);
}