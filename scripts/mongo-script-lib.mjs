import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MANIFEST_PATH = path.join(__dirname, "mongo-backup-manifest.json");
export const LEGACY_DEFAULT_DB_NAME = "prod";

export function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) {
    return;
  }
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function databaseNameFromMongoUri(uri) {
  const match = uri.match(/mongodb(?:\+srv)?:\/\/[^/]+\/([^/?#]+)/);
  const segment = match?.[1];
  if (!segment) {
    return undefined;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function resolveMongoDbName(mongoUri, explicitDbName) {
  const explicit = explicitDbName?.trim();
  if (explicit) {
    return explicit;
  }
  if (mongoUri) {
    const fromUri = databaseNameFromMongoUri(mongoUri);
    if (fromUri) {
      return fromUri;
    }
  }
  return LEGACY_DEFAULT_DB_NAME;
}

export function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

export function flattenCollections(manifest) {
  const names = [];
  for (const block of Object.values(manifest.categories)) {
    for (const name of block.collections) {
      if (!names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names.sort();
}

export function requireMongoUri() {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Load nursing-edge/.env.local or export the variable.");
  }
  return uri;
}

export function resolveSourceDbName(uri) {
  return resolveMongoDbName(uri, process.env.MONGODB_DB_NAME);
}

/** Block accidental restore into production-named databases from a laptop. */
export function assertSafeTargetDbName(targetDb, { allowProdTarget = false } = {}) {
  if (!targetDb || !targetDb.trim()) {
    throw new Error("Target database name is required.");
  }
  const name = targetDb.trim();
  const prodLike = new Set(["prod", "production"]);
  if (prodLike.has(name.toLowerCase()) && !allowProdTarget) {
    throw new Error(
      `Refusing target database "${name}". Use a dedicated drill name (e.g. nursing-edge-restore-drill-YYYY-MM-DD) or pass --allow-prod-target.`,
    );
  }
  return name;
}
