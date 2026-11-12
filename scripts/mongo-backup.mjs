#!/usr/bin/env node
/**
 * Repeatable MongoDB backup for Nursing Edge (mongodump + manifest).
 *
 * Usage (from nursing-edge/):
 *   node scripts/mongo-backup.mjs
 *   node scripts/mongo-backup.mjs --probe-only
 *   node scripts/mongo-backup.mjs --output-dir ../backups/custom-run
 *
 * Requires: MONGODB_URI, and MONGODB_DB_NAME (recommended). MongoDB Database Tools (mongodump) unless --probe-only.
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { MongoClient } = require("mongodb");

const LEGACY_DEFAULT_DB_NAME = "prod";
const MANIFEST_PATH = path.join(__dirname, "mongo-backup-manifest.json");

function loadEnvLocal() {
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

function databaseNameFromMongoUri(uri) {
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

function resolveMongoDbName(mongoUri, explicitDbName) {
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

function flattenCollections(manifest) {
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

function parseArgs(argv) {
  let probeOnly = false;
  let outputDir;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--probe-only") {
      probeOnly = true;
    } else if (arg === "--output-dir" && argv[i + 1]) {
      outputDir = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/mongo-backup.mjs [--probe-only] [--output-dir <path>]`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return { probeOnly, outputDir };
}

function timestampSlug(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function dirSizeBytes(root) {
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSafe(current)) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        total += statSync(full).size;
      }
    }
  }
  return total;
}

function readdirSafe(dir) {
  const { readdirSync } = require("node:fs");
  return readdirSync(dir, { withFileTypes: true });
}

function findMongodump() {
  const candidates = ["mongodump"];
  if (process.platform === "win32") {
    const versions = ["100", "200"];
    for (const ver of versions) {
      candidates.push(
        `C:\\Program Files\\MongoDB\\Tools\\${ver}\\bin\\mongodump.exe`,
      );
    }
  }
  for (const cmd of candidates) {
    const probe = spawnSync(cmd, ["--version"], {
      encoding: "utf8",
      shell: false,
    });
    if (probe.status === 0) {
      return { cmd, version: (probe.stdout || probe.stderr || "").trim() };
    }
  }
  return null;
}

async function collectionStats(uri, dbName, collections) {
  const client = new MongoClient(uri);
  const started = Date.now();
  try {
    await client.connect();
    const db = client.db(dbName);
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map(
        (c) => c.name,
      ),
    );
    const rows = [];
    for (const name of collections) {
      if (!existing.has(name)) {
        rows.push({ collection: name, document_count: 0, missing: true });
        continue;
      }
      const document_count = await db.collection(name).estimatedDocumentCount();
      rows.push({ collection: name, document_count, missing: false });
    }
    return { rows, connect_ms: Date.now() - started };
  } finally {
    await client.close();
  }
}

function runMongodump(mongodumpCmd, uri, dbName, collection, outDir) {
  const args = ["--uri", uri, "--db", dbName, "--collection", collection, "--out", outDir];
  const result = spawnSync(mongodumpCmd, args, {
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(
      `mongodump failed for ${collection}: ${result.stderr || result.stdout || result.status}`,
    );
  }
}

async function main() {
  loadEnvLocal();
  const { probeOnly, outputDir: outputDirArg } = parseArgs(process.argv.slice(2));

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Load nursing-edge/.env.local or export the variable.");
    process.exit(1);
  }

  const dbName = resolveMongoDbName(uri, process.env.MONGODB_DB_NAME);
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const collections = flattenCollections(manifest);

  const now = new Date();
  const outputDir =
    outputDirArg ??
    path.join(
      __dirname,
      "..",
      "backups",
      `mongo-${dbName}-${timestampSlug(now)}`,
    );
  mkdirSync(outputDir, { recursive: true });
  copyFileSync(MANIFEST_PATH, path.join(outputDir, "mongo-backup-manifest.json"));

  const report = {
    started_at: now.toISOString(),
    database: dbName,
    probe_only: probeOnly,
    collections_requested: collections.length,
    output_dir: path.resolve(outputDir),
    mongodump: null,
    collection_stats: [],
    duration_ms: null,
    dump_bytes: null,
  };

  const stats = await collectionStats(uri, dbName, collections);
  report.collection_stats = stats.rows;

  if (probeOnly) {
    const finished = new Date();
    report.finished_at = finished.toISOString();
    report.duration_ms = finished.getTime() - now.getTime();
    const reportPath = path.join(outputDir, "backup-run-report.json");
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Probe complete for database "${dbName}".`);
    console.log(`Report: ${reportPath}`);
    console.log(
      `Collections: ${collections.length}; missing: ${stats.rows.filter((r) => r.missing).length}`,
    );
    return;
  }

  const mongodump = findMongodump();
  if (!mongodump) {
    console.error(
      "mongodump not found. Install MongoDB Database Tools or run with --probe-only to record counts only.",
    );
    process.exit(1);
  }
  report.mongodump = mongodump;

  for (const name of collections) {
    const row = stats.rows.find((r) => r.collection === name);
    if (row?.missing) {
      console.log(`Skip missing collection: ${name}`);
      continue;
    }
    console.log(`Dumping ${name}...`);
    runMongodump(mongodump.cmd, uri, dbName, name, outputDir);
  }

  const finished = new Date();
  report.finished_at = finished.toISOString();
  report.duration_ms = finished.getTime() - now.getTime();
  report.dump_bytes = dirSizeBytes(outputDir);

  const reportPath = path.join(outputDir, "backup-run-report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Backup complete for database "${dbName}".`);
  console.log(`Output: ${path.resolve(outputDir)}`);
  console.log(`Size: ${report.dump_bytes} bytes; duration: ${report.duration_ms} ms`);
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
