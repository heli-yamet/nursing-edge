export const DATABASE_BACKUP_BLOB_PREFIX = "backups/";

export const BACKUP_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export const BACKUP_FORMAT_VERSION = 1;

export function isValidBackupName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("/")) {
    return false;
  }
  return BACKUP_NAME_PATTERN.test(trimmed);
}

export function defaultBackupName(databaseName: string): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}_${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
  const safeDb = databaseName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `backup_${safeDb}_${stamp}`;
}

export function backupMetaPath(backupName: string): string {
  return `${DATABASE_BACKUP_BLOB_PREFIX}${backupName}/meta.json`;
}

export function backupReportPath(backupName: string): string {
  return `${DATABASE_BACKUP_BLOB_PREFIX}${backupName}/report.json`;
}

export function backupCollectionDataPath(
  backupName: string,
  collection: string,
): string {
  return `${DATABASE_BACKUP_BLOB_PREFIX}${backupName}/data/${collection}.ndjson`;
}

export function backupPrefixForName(backupName: string): string {
  return `${DATABASE_BACKUP_BLOB_PREFIX}${backupName}/`;
}

export function parseBackupNameFromPath(pathname: string): string | null {
  const normalized = pathname.replace(/^\/+/, "");
  if (!normalized.startsWith(DATABASE_BACKUP_BLOB_PREFIX)) {
    return null;
  }
  const rest = normalized.slice(DATABASE_BACKUP_BLOB_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) {
    return null;
  }
  const name = rest.slice(0, slash);
  return isValidBackupName(name) ? name : null;
}