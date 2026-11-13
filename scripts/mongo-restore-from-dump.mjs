#!/usr/bin/env node
/**
 * Restore a mongodump folder into a target database (MongoDB Database Tools required).
 *
 * Usage:
 *   node scripts/mongo-restore-from-dump.mjs --dump-dir ./backups/mongo-prod-... --target-db nursing-edge-restore-drill-2026-11-12
 */

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertSafeTargetDbName,
  requireMongoUri,
  resolveSourceDbName,
} from "./mongo-script-lib.mjs";

function findMongorestore() {
  const candidates = ["mongorestore"];
  if (process.platform === "win32") {
    for (const ver of ["100", "200"]) {
      candidates.push(`C:\\Program Files\\MongoDB\\Tools\\${ver}\\bin\\mongorestore.exe`);
    }
  }
  for (const cmd of candidates) {
    const probe = spawnSync(cmd, ["--version"], { encoding: "utf8", shell: false });
    if (probe.status === 0) {
      return cmd;
    }
  }
  return null;
}

function parseArgs(argv) {
  let dumpDir;
  let targetDb;
  let sourceDb;
  let allowProdTarget = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dump-dir" && argv[i + 1]) {
      dumpDir = argv[++i];
    } else if (arg === "--target-db" && argv[i + 1]) {
      targetDb = argv[++i];
    } else if (arg === "--source-db" && argv[i + 1]) {
      sourceDb = argv[++i];
    } else if (arg === "--allow-prod-target") {
      allowProdTarget = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/mongo-restore-from-dump.mjs --dump-dir <path> --target-db <name> [--source-db <dump-db-name>]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  if (!dumpDir || !targetDb) {
    console.error("--dump-dir and --target-db are required.");
    process.exit(1);
  }
  return { dumpDir, targetDb, sourceDb, allowProdTarget };
}

function detectDumpDbName(dumpDir) {
  const entries = readdirSync(dumpDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      return entry.name;
    }
  }
  return null;
}

function main() {
  const { dumpDir, targetDb, sourceDb, allowProdTarget } = parseArgs(process.argv.slice(2));
  const resolvedDump = path.resolve(dumpDir);
  if (!existsSync(resolvedDump)) {
    console.error(`Dump directory not found: ${resolvedDump}`);
    process.exit(1);
  }

  const targetDbName = assertSafeTargetDbName(targetDb, { allowProdTarget });
  const uri = requireMongoUri();
  const fromDb = sourceDb ?? detectDumpDbName(resolvedDump) ?? resolveSourceDbName(uri);

  if (fromDb === targetDbName) {
    console.error("Target database must differ from the dump source database name.");
    process.exit(1);
  }

  const mongorestore = findMongorestore();
  if (!mongorestore) {
    console.error(
      "mongorestore not found. Install MongoDB Database Tools or use mongo-clone-database.mjs for same-cluster drill.",
    );
    process.exit(1);
  }

  const args = [
    "--uri",
    uri,
    "--dir",
    resolvedDump,
    `--nsInclude=${fromDb}.*`,
    `--nsFrom=${fromDb}.*`,
    `--nsTo=${targetDbName}.*`,
    "--drop",
  ];

  console.log(`Restoring ${fromDb} → ${targetDbName} from ${resolvedDump}`);
  const result = spawnSync(mongorestore, args, { encoding: "utf8", shell: false });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || `mongorestore exit ${result.status}`);
    process.exit(result.status ?? 1);
  }
  console.log("mongorestore finished successfully.");
}

main();
