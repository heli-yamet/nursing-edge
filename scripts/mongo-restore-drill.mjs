#!/usr/bin/env node
/**
 * Thursday restore drill (same cluster): fingerprint → clone or existing dump → indexes → verify.
 *
 * Usage:
 *   node scripts/mongo-restore-drill.mjs --target-db nursing-edge-restore-drill-2026-11-12
 *   node scripts/mongo-restore-drill.mjs --target-db <name> --dump-dir ./backups/mongo-...
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertSafeTargetDbName,
  requireMongoUri,
  resolveMongoDbName,
} from "./mongo-script-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

function timestampSlug(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function runNode(script, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit ${result.status}`);
  }
}

function parseArgs(argv) {
  let targetDb;
  let dumpDir;
  let sourceDb;
  let allowProdTarget = false;
  let skipClone = false;
  let resumeDir;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target-db" && argv[i + 1]) {
      targetDb = argv[++i];
    } else if (arg === "--dump-dir" && argv[i + 1]) {
      dumpDir = argv[++i];
    } else if (arg === "--source-db" && argv[i + 1]) {
      sourceDb = argv[++i];
    } else if (arg === "--resume-dir" && argv[i + 1]) {
      resumeDir = path.resolve(argv[++i]);
    } else if (arg === "--skip-clone") {
      skipClone = true;
    } else if (arg === "--allow-prod-target") {
      allowProdTarget = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/mongo-restore-drill.mjs --target-db <name> [--dump-dir <path>] [--source-db <name>]",
      );
      process.exit(0);
    }
  }
  if (!targetDb) {
    console.error("--target-db is required.");
    process.exit(1);
  }
  return { targetDb, dumpDir, sourceDb, allowProdTarget, skipClone, resumeDir };
}

async function main() {
  const { targetDb, dumpDir, sourceDb, allowProdTarget, skipClone, resumeDir } = parseArgs(
    process.argv.slice(2),
  );
  const uri = requireMongoUri();
  const sourceDbName = sourceDb ?? resolveMongoDbName(uri, process.env.MONGODB_DB_NAME);
  const targetDbName = assertSafeTargetDbName(targetDb, { allowProdTarget });

  const now = new Date();
  const outDir =
    resumeDir ?? path.join(projectRoot, "backups", `restore-drill-${timestampSlug(now)}`);
  mkdirSync(outDir, { recursive: true });

  const beforePath = path.join(outDir, "source-fingerprint.json");
  const afterPath = path.join(outDir, "restored-fingerprint.json");

  const started = Date.now();
  if (!skipClone && !resumeDir) {
    runNode("mongo-restore-fingerprint.mjs", ["--db", sourceDbName, "--out", beforePath]);
  }

  if (skipClone || resumeDir) {
    if (!existsSync(beforePath)) {
      throw new Error(`Missing source fingerprint: ${beforePath}`);
    }
  } else if (dumpDir) {
    const restoreArgs = ["--dump-dir", path.resolve(dumpDir), "--target-db", targetDbName];
    if (sourceDb) {
      restoreArgs.push("--source-db", sourceDb);
    }
    if (allowProdTarget) {
      restoreArgs.push("--allow-prod-target");
    }
    runNode("mongo-restore-from-dump.mjs", restoreArgs);
  } else if (!skipClone) {
    const cloneArgs = ["--target-db", targetDbName, "--source-db", sourceDbName];
    if (allowProdTarget) {
      cloneArgs.push("--allow-prod-target");
    }
    runNode("mongo-clone-database.mjs", cloneArgs);
  }

  runNode("mongo-ensure-indexes.harness.mjs", ["--db", targetDbName]);

  runNode("mongo-restore-fingerprint.mjs", [
    "--db",
    targetDbName,
    "--out",
    afterPath,
  ]);
  runNode("mongo-restore-verify.mjs", ["--before", beforePath, "--after", afterPath]);

  const report = {
    started_at: now.toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    source_database: sourceDbName,
    target_database: targetDbName,
    method: dumpDir ? "mongorestore" : "driver_clone",
    dump_dir: dumpDir ? path.resolve(dumpDir) : null,
    output_dir: outDir,
    verification: "passed",
  };
  writeFileSync(path.join(outDir, "restore-drill-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Restore drill complete. Report: ${path.join(outDir, "restore-drill-report.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
