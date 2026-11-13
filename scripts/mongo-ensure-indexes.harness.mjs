#!/usr/bin/env node
/**
 * Recreate schema indexes on MONGODB_DB_NAME (restore drill). Does not start Next.js.
 *
 * Usage: node scripts/mongo-ensure-indexes.harness.mjs [--db <name>]
 */

import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnvLocal, resolveMongoDbName, requireMongoUri } from "./mongo-script-lib.mjs";

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  let dbName;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--db" && argv[i + 1]) {
      dbName = argv[++i];
    }
  }
  return { dbName };
}

const { dbName } = parseArgs(process.argv.slice(2));
loadEnvLocal();
const uri = requireMongoUri();
const targetDb = dbName ?? resolveMongoDbName(uri, process.env.MONGODB_DB_NAME);

const result = spawnSync(
  "npm",
  ["run", "test", "--", "src/tests/mongo-ensure-indexes.harness.test.ts"],
  {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, MONGODB_URI: uri, MONGODB_DB_NAME: targetDb },
    shell: true,
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
