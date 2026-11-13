#!/usr/bin/env node
/**
 * Capture a restore-proof fingerprint: counts, ACTIVE sessions, attempt totals, Review cycles, import batches.
 *
 * Usage:
 *   node scripts/mongo-restore-fingerprint.mjs [--db <name>] [--out <file.json>]
 */

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  flattenCollections,
  loadManifest,
  requireMongoUri,
  resolveMongoDbName,
} from "./mongo-script-lib.mjs";

const require = createRequire(import.meta.url);
const { MongoClient } = require("mongodb");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  let dbName;
  let outPath;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--db" && argv[i + 1]) {
      dbName = argv[++i];
    } else if (arg === "--out" && argv[i + 1]) {
      outPath = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/mongo-restore-fingerprint.mjs [--db <name>] [--out <file.json>]");
      process.exit(0);
    }
  }
  return { dbName, outPath };
}

async function fingerprintDb(client, dbName, collections) {
  const db = client.db(dbName);
  const collection_counts = {};
  for (const name of collections) {
    const names = (await db.listCollections({ name }, { nameOnly: true }).toArray()).map(
      (c) => c.name,
    );
    if (!names.includes(name)) {
      collection_counts[name] = { missing: true, document_count: 0 };
      continue;
    }
    const document_count = await db.collection(name).estimatedDocumentCount();
    collection_counts[name] = { missing: false, document_count };
  }

  const active_sessions = await db
    .collection("sessions")
    .find({ state: "ACTIVE" })
    .project({
      _id: 0,
      session_id: 1,
      learner_id: 1,
      state: 1,
      session_type: 1,
      updated_at: 1,
    })
    .toArray();

  const attempt_totals_by_session = {};
  for (const session of active_sessions) {
    const count = await db.collection("attempts").countDocuments({
      session_id: session.session_id,
    });
    attempt_totals_by_session[session.session_id] = count;
  }

  const reviewAgg = await db
    .collection("review_cycles")
    .aggregate([{ $group: { _id: "$learner_id", count: { $sum: 1 } } }])
    .toArray();
  const review_cycles_by_learner = Object.fromEntries(
    reviewAgg.map((row) => [row._id, row.count]),
  );

  const batch_count = await db.collection("import_batches").estimatedDocumentCount();
  const latest_batch = await db
    .collection("import_batches")
    .find({})
    .sort({ created_at: -1 })
    .limit(1)
    .project({ _id: 0, batch_id: 1, created_at: 1, passed_count: 1, failed_count: 1 })
    .toArray();

  const staging_line_count = await db.collection("import_lines").countDocuments({});

  return {
    database: dbName,
    generated_at: new Date().toISOString(),
    collection_counts,
    active_sessions,
    attempt_totals_by_session,
    review_cycles_by_learner,
    import_staging: {
      batch_count,
      latest_batch: latest_batch[0] ?? null,
      staging_line_count,
    },
  };
}

async function main() {
  const { dbName: dbArg, outPath } = parseArgs(process.argv.slice(2));
  const uri = requireMongoUri();
  const dbName = dbArg ?? resolveMongoDbName(uri, process.env.MONGODB_DB_NAME);
  const manifest = loadManifest();
  const collections = flattenCollections(manifest);

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 120_000 });
  try {
    await client.connect();
    const fingerprint = await fingerprintDb(client, dbName, collections);
    const text = `${JSON.stringify(fingerprint, null, 2)}\n`;
    if (outPath) {
      writeFileSync(path.resolve(outPath), text, "utf8");
      console.log(`Wrote fingerprint: ${path.resolve(outPath)}`);
    } else {
      process.stdout.write(text);
    }
    console.error(
      `ACTIVE sessions: ${fingerprint.active_sessions.length}; collections tracked: ${collections.length}`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
