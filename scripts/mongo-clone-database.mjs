#!/usr/bin/env node
/**
 * Dev restore drill: copy all manifest collections from source DB to an empty target DB on the same cluster.
 * Prefer mongorestore from a mongodump when Database Tools are installed (see mongodb-restore.md).
 *
 * Usage:
 *   node scripts/mongo-clone-database.mjs --target-db nursing-edge-restore-drill-2026-11-12
 *   node scripts/mongo-clone-database.mjs --target-db <name> --source-db <name>
 */

import { createRequire } from "node:module";
import {
  assertSafeTargetDbName,
  flattenCollections,
  loadManifest,
  requireMongoUri,
  resolveMongoDbName,
} from "./mongo-script-lib.mjs";

const require = createRequire(import.meta.url);
const { MongoClient } = require("mongodb");

const BATCH_SIZE = 500;

function parseArgs(argv) {
  let targetDb;
  let sourceDb;
  let allowProdTarget = false;
  let preserveTarget = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target-db" && argv[i + 1]) {
      targetDb = argv[++i];
    } else if (arg === "--source-db" && argv[i + 1]) {
      sourceDb = argv[++i];
    } else if (arg === "--allow-prod-target") {
      allowProdTarget = true;
    } else if (arg === "--preserve-target") {
      preserveTarget = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/mongo-clone-database.mjs --target-db <name> [--source-db <name>] [--allow-prod-target]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  if (!targetDb) {
    console.error("--target-db is required.");
    process.exit(1);
  }
  return { targetDb, sourceDb, allowProdTarget, preserveTarget };
}

async function copyCollection(sourceDb, targetDb, targetDbName, name) {
  const source = sourceDb.collection(name);
  const target = targetDb.collection(name);
  const existing = await targetDb.listCollections({ name }, { nameOnly: true }).toArray();
  if (existing.length > 0) {
    await target.drop().catch(() => target.deleteMany({}));
  }

  const useOut =
    process.env.MONGO_CLONE_USE_OUT === "1" || process.env.MONGO_CLONE_USE_OUT === "true";
  if (useOut) {
    try {
      await source
        .aggregate([{ $match: {} }, { $out: { db: targetDbName, coll: name } }], {
          allowDiskUse: true,
        })
        .toArray();
      return await target.estimatedDocumentCount();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`$out failed for ${name}, using batch copy: ${message}`);
      await target.drop().catch(() => target.deleteMany({}));
    }
  }

  const cursor = source.find({});
  const batch = [];
  let copied = 0;
  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) {
      await target.insertMany(batch, { ordered: false });
      copied += batch.length;
      batch.length = 0;
    }
  }
  if (batch.length > 0) {
    await target.insertMany(batch, { ordered: false });
    copied += batch.length;
  }
  return copied;
}

async function main() {
  const { targetDb: targetArg, sourceDb: sourceArg, allowProdTarget, preserveTarget } =
    parseArgs(process.argv.slice(2));
  const uri = requireMongoUri();
  const sourceDbName = sourceArg ?? resolveMongoDbName(uri, process.env.MONGODB_DB_NAME);
  const targetDbName = assertSafeTargetDbName(targetArg, { allowProdTarget });

  if (sourceDbName === targetDbName) {
    throw new Error("Source and target database names must differ.");
  }

  const manifest = loadManifest();
  const collections = flattenCollections(manifest);

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 120_000,
    socketTimeoutMS: 600_000,
  });
  const started = Date.now();
  try {
    await client.connect();
    const sourceDb = client.db(sourceDbName);
    const targetDb = client.db(targetDbName);

    if (!preserveTarget) {
      const existing = await targetDb.listCollections({}, { nameOnly: true }).toArray();
      if (existing.length > 0) {
        console.log(
          `Clearing target database "${targetDbName}" (${existing.length} collections) before clone...`,
        );
        try {
          await targetDb.dropDatabase();
        } catch {
          for (const entry of existing) {
            await targetDb.collection(entry.name).drop().catch(() => undefined);
          }
        }
      }
    }

    const summary = [];
    for (const name of collections) {
      const sourceExists = await sourceDb
        .listCollections({ name }, { nameOnly: true })
        .toArray();
      if (sourceExists.length === 0) {
        console.log(`Skip missing source collection: ${name}`);
        summary.push({ collection: name, copied: 0, skipped: true });
        continue;
      }
      console.log(`Copying ${name}...`);
      const copied = await copyCollection(sourceDb, targetDb, targetDbName, name);
      summary.push({ collection: name, copied, skipped: false });
    }

    console.log(
      `Clone complete: "${sourceDbName}" → "${targetDbName}" in ${Date.now() - started} ms`,
    );
    const total = summary.reduce((n, row) => n + row.copied, 0);
    console.log(`Documents copied (sum of per-collection counts): ${total}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
