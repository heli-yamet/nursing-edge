#!/usr/bin/env node
/**
 * Compare two fingerprint JSON files from mongo-restore-fingerprint.mjs.
 *
 * Usage:
 *   node scripts/mongo-restore-verify.mjs --before <source.json> --after <target.json>
 */

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  let before;
  let after;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--before" && argv[i + 1]) {
      before = argv[++i];
    } else if (arg === "--after" && argv[i + 1]) {
      after = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/mongo-restore-verify.mjs --before <a.json> --after <b.json>");
      process.exit(0);
    }
  }
  if (!before || !after) {
    console.error("--before and --after are required.");
    process.exit(1);
  }
  return { before, after };
}

function stableStringify(value) {
  return JSON.stringify(value);
}

function compareFingerprints(expected, actual) {
  const errors = [];

  const expectedCounts = {};
  const actualCounts = {};
  for (const [name, row] of Object.entries(expected.collection_counts)) {
    expectedCounts[name] = row.document_count;
  }
  for (const [name, row] of Object.entries(actual.collection_counts)) {
    actualCounts[name] = row.document_count;
  }
  if (stableStringify(expectedCounts) !== stableStringify(actualCounts)) {
    errors.push("collection document counts differ between source and restored database");
  }

  if (
    stableStringify(expected.active_sessions) !== stableStringify(actual.active_sessions)
  ) {
    errors.push("ACTIVE session rows differ");
  }

  if (
    stableStringify(expected.attempt_totals_by_session) !==
    stableStringify(actual.attempt_totals_by_session)
  ) {
    errors.push("attempt totals by ACTIVE session differ");
  }

  if (
    stableStringify(expected.review_cycles_by_learner) !==
    stableStringify(actual.review_cycles_by_learner)
  ) {
    errors.push("review cycle counts by learner differ");
  }

  if (
    stableStringify(expected.import_staging) !== stableStringify(actual.import_staging)
  ) {
    errors.push("import staging summary differs");
  }

  return errors;
}

function main() {
  const { before, after } = parseArgs(process.argv.slice(2));
  const expected = JSON.parse(readFileSync(before, "utf8"));
  const actual = JSON.parse(readFileSync(after, "utf8"));
  const errors = compareFingerprints(expected, actual);

  if (errors.length > 0) {
    console.error("Restore verification FAILED:");
    for (const line of errors) {
      console.error(`  - ${line}`);
    }
    process.exit(1);
  }

  console.log("Restore verification passed.");
  console.log(
    `ACTIVE sessions preserved: ${actual.active_sessions.length}; import batches: ${actual.import_staging.batch_count}`,
  );
}

main();
