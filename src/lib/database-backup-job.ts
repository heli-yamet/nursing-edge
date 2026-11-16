import { randomUUID } from "node:crypto";
import type { Db, Document } from "mongodb";
import { getDb } from "@/lib/mongo";

export type DatabaseBackupJobKind = "backup" | "restore";

export type DatabaseBackupJobStatus = "running" | "completed" | "failed";

export type DatabaseBackupJob = {
  job_id: string;
  kind: DatabaseBackupJobKind;
  status: DatabaseBackupJobStatus;
  backup_name: string;
  database_name: string;
  collections: string[];
  collection_index: number;
  collection_stats: { collection: string; document_count: number }[];
  percent: number;
  message: string;
  started_by_admin_id: string;
  started_by_email: string;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
  error: string | null;
};

const COLLECTION = "database_backup_jobs";

function rowFromDoc(doc: Document): DatabaseBackupJob {
  return {
    job_id: String(doc.job_id),
    kind: doc.kind as DatabaseBackupJobKind,
    status: doc.status as DatabaseBackupJobStatus,
    backup_name: String(doc.backup_name),
    database_name: String(doc.database_name),
    collections: Array.isArray(doc.collections)
      ? doc.collections.map(String)
      : [],
    collection_index: Number(doc.collection_index ?? 0),
    collection_stats: Array.isArray(doc.collection_stats)
      ? (doc.collection_stats as DatabaseBackupJob["collection_stats"])
      : [],
    percent: Number(doc.percent ?? 0),
    message: String(doc.message ?? ""),
    started_by_admin_id: String(doc.started_by_admin_id),
    started_by_email: String(doc.started_by_email),
    started_at: String(doc.started_at),
    updated_at: String(doc.updated_at),
    finished_at: doc.finished_at ? String(doc.finished_at) : null,
    error: doc.error ? String(doc.error) : null,
  };
}

export async function ensureDatabaseBackupJobIndexes(db: Db): Promise<void> {
  await db
    .collection(COLLECTION)
    .createIndex({ job_id: 1 }, { unique: true });
  await db
    .collection(COLLECTION)
    .createIndex({ status: 1, started_at: -1 });
}

export async function getRunningDatabaseBackupJob(): Promise<DatabaseBackupJob | null> {
  const db = await getDb();
  await ensureDatabaseBackupJobIndexes(db);
  const doc = await db.collection(COLLECTION).findOne(
    { status: "running" },
    { sort: { started_at: -1 } },
  );
  return doc ? rowFromDoc(doc) : null;
}

export async function getDatabaseBackupJob(
  jobId: string,
): Promise<DatabaseBackupJob | null> {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ job_id: jobId });
  return doc ? rowFromDoc(doc) : null;
}

export async function createDatabaseBackupJob(input: {
  kind: DatabaseBackupJobKind;
  backup_name: string;
  database_name: string;
  collections: string[];
  started_by_admin_id: string;
  started_by_email: string;
}): Promise<DatabaseBackupJob> {
  const db = await getDb();
  await ensureDatabaseBackupJobIndexes(db);

  const running = await getRunningDatabaseBackupJob();
  if (running) {
    throw new Error("A backup or restore job is already running.");
  }

  const now = new Date().toISOString();
  const job: DatabaseBackupJob = {
    job_id: randomUUID(),
    kind: input.kind,
    status: "running",
    backup_name: input.backup_name,
    database_name: input.database_name,
    collections: input.collections,
    collection_index: 0,
    collection_stats: [],
    percent: 0,
    message: "Starting…",
    started_by_admin_id: input.started_by_admin_id,
    started_by_email: input.started_by_email,
    started_at: now,
    updated_at: now,
    finished_at: null,
    error: null,
  };

  await db.collection(COLLECTION).insertOne({ ...job });

  return job;
}

export async function updateDatabaseBackupJob(
  jobId: string,
  patch: Partial<
    Pick<
      DatabaseBackupJob,
      | "collection_index"
      | "collection_stats"
      | "percent"
      | "message"
      | "status"
      | "finished_at"
      | "error"
    >
  >,
): Promise<DatabaseBackupJob | null> {
  const db = await getDb();
  const updated_at = new Date().toISOString();
  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { job_id: jobId, status: "running" },
    { $set: { ...patch, updated_at } },
    { returnDocument: "after" },
  );
  return result ? rowFromDoc(result) : null;
}