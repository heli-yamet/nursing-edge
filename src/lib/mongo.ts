import { MongoClient, type ClientSession, type Db } from "mongodb";
import { ensureRelationshipIndexes } from "@/lib/relationship-indexes";

const uri = process.env.MONGODB_URI;

type GlobalMongo = typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
  _schemaIndexes?: Promise<void>;
};

function getClientPromise(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  const globalMongo = globalThis as GlobalMongo;
  if (!globalMongo._mongoClientPromise) {
    const client = new MongoClient(uri);
    globalMongo._mongoClientPromise = client.connect();
  }
  return globalMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  const db = client.db("prod");
  const globalMongo = globalThis as GlobalMongo;
  if (!globalMongo._schemaIndexes) {
    globalMongo._schemaIndexes = ensureIndexes(db);
  }
  await globalMongo._schemaIndexes;
  return db;
}

export async function runInTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  await getDb();
  const client = await getClientPromise();
  const session = client.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("admin_users").createIndex({ email: 1 }, { unique: true });
  await db.collection("admin_users").createIndex({ admin_id: 1 }, { unique: true });
  await db.collection("admin_users").createIndex(
    { role: 1 },
    { unique: true, partialFilterExpression: { role: "SUPER_ADMIN" } },
  );
  await db
    .collection("admin_users_codes")
    .createIndex({ email: 1 }, { unique: true });

  await db.collection("learners").createIndex({ learner_id: 1 }, { unique: true });
  await db.collection("learners").createIndex({ email: 1 }, { unique: true });
  await db
    .collection("learner_codes")
    .createIndex({ email: 1 }, { unique: true });

  await db
    .collection("entitlements")
    .createIndex({ entitlement_id: 1 }, { unique: true });
  await db.collection("entitlements").createIndex({ learner_id: 1 });
  await db.collection("entitlements").createIndex({ email_hint: 1 });
  await db.collection("entitlements").createIndex(
    { shopify_subscription_id: 1 },
    {
      unique: true,
      partialFilterExpression: { shopify_subscription_id: { $type: "string" } },
    },
  );
  await db.collection("entitlements").createIndex(
    { source: 1, email_hint: 1 },
    {
      name: "active_manual_grant_email",
      unique: true,
      partialFilterExpression: {
        source: "MANUAL_GRANT",
        status: "ACTIVE",
        email_hint: { $type: "string" },
      },
    },
  );
  await db
    .collection("access_grant_audits")
    .createIndex({ audit_id: 1 }, { unique: true });
  await db.collection("access_grant_audits").createIndex({ occurred_at: -1 });

  await db
    .collection("questions")
    .createIndex({ question_id: 1 }, { unique: true });

  await db
    .collection("question_versions")
    .createIndex({ question_version_id: 1 }, { unique: true });
  await db.collection("question_versions").createIndex({ question_id: 1 });

  await db.collection("sessions").createIndex({ session_id: 1 }, { unique: true });
  await db.collection("sessions").createIndex({ learner_id: 1, state: 1 });
  await db.collection("sessions").createIndex(
    { learner_id: 1 },
    { unique: true, partialFilterExpression: { state: "ACTIVE" } },
  );

  await db.collection("attempts").createIndex({ attempt_id: 1 }, { unique: true });
  await db.collection("attempts").createIndex(
    { session_id: 1, position: 1 },
    { unique: true },
  );
  await db.collection("attempts").createIndex({ session_id: 1, sequence: 1 });
  await db.collection("attempts").createIndex({ learner_id: 1 });
  await db.collection("attempts").createIndex({ question_version_id: 1 });

  await db
    .collection("interview_deliveries")
    .createIndex({ delivery_id: 1 }, { unique: true });
  await db.collection("interview_deliveries").createIndex(
    {
      session_id: 1,
      position: 1,
      teaching_id: 1,
      teaching_revision: 1,
      kind: 1,
      prompt_number: 1,
    },
    { unique: true },
  );

  await db
    .collection("exposures")
    .createIndex({ exposure_id: 1 }, { unique: true });
  await db
    .collection("exposures")
    .createIndex({ learner_id: 1, question_version_id: 1, session_id: 1 });

  await db
    .collection("review_cycles")
    .createIndex({ cycle_id: 1 }, { unique: true });
  await ensureOpenReviewCycleIndex(db);
  await db.collection("review_cycles").createIndex({ learner_id: 1, due_at: 1 });

  await db
    .collection("review_transitions")
    .createIndex({ transition_id: 1 }, { unique: true });
  await db.collection("review_transitions").createIndex({ cycle_id: 1 });

  await db
    .collection("import_batches")
    .createIndex({ batch_id: 1 }, { unique: true });
  await db.collection("import_batches").createIndex({ created_at: 1 });

  await db.collection("import_lines").createIndex({ line_id: 1 }, { unique: true });
  await db.collection("import_lines").createIndex({ batch_id: 1 });
  await db.collection("import_lines").createIndex({ question_version_id: 1 });

  await db
    .collection("publish_audits")
    .createIndex({ audit_id: 1 }, { unique: true });
  await db.collection("publish_audits").createIndex({ occurred_at: -1 });

  await db
    .collection("pause_audits")
    .createIndex({ audit_id: 1 }, { unique: true });
  await db.collection("pause_audits").createIndex({ occurred_at: -1 });

  await db
    .collection("delete_audits")
    .createIndex({ audit_id: 1 }, { unique: true });
  await db.collection("delete_audits").createIndex({ occurred_at: -1 });

  await db
    .collection("calibration_blueprints")
    .createIndex({ blueprint_id: 1 }, { unique: true });
  await db.collection("calibration_blueprints").createIndex(
    { active: 1 },
    { unique: true, partialFilterExpression: { active: true } },
  );

  await db
    .collection("calibration_uploads")
    .createIndex({ question_version_id: 1 }, { unique: true });

  await db
    .collection("calibrations")
    .createIndex({ calibration_id: 1 }, { unique: true });
  await db
    .collection("calibrations")
    .createIndex({ learner_id: 1 }, { unique: true });

  await ensureRelationshipIndexes(db);
}

async function ensureOpenReviewCycleIndex(db: Db): Promise<void> {
  const collection = db.collection("review_cycles");
  const indexes = await collection.indexes();
  const existing = indexes.find(
    (index) =>
      index.unique === true &&
      index.key?.learner_id === 1 &&
      index.key?.question_id === 1,
  );
  if (existing?.name && !openCycleIndexCoversPaused(existing.partialFilterExpression)) {
    await collection.dropIndex(existing.name);
  }
  await collection.createIndex(
    { learner_id: 1, question_id: 1 },
    {
      unique: true,
      partialFilterExpression: { state: { $in: ["ACTIVE", "PAUSED"] } },
    },
  );
}

function openCycleIndexCoversPaused(filter: unknown): boolean {
  if (typeof filter !== "object" || filter === null || !("state" in filter)) {
    return false;
  }
  const state = filter.state;
  if (typeof state !== "object" || state === null || !("$in" in state)) {
    return false;
  }
  const values = state.$in;
  return (
    Array.isArray(values) &&
    values.includes("ACTIVE") &&
    values.includes("PAUSED")
  );
}
