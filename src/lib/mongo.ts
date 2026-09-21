import { MongoClient, type Db } from "mongodb";

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
  const db = client.db();
  const globalMongo = globalThis as GlobalMongo;
  if (!globalMongo._schemaIndexes) {
    globalMongo._schemaIndexes = ensureIndexes(db);
  }
  await globalMongo._schemaIndexes;
  return db;
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
    .collection("entitlements")
    .createIndex({ entitlement_id: 1 }, { unique: true });
  await db.collection("entitlements").createIndex({ learner_id: 1 });

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
  await db.collection("attempts").createIndex({ session_id: 1, sequence: 1 });
  await db.collection("attempts").createIndex({ learner_id: 1 });
  await db.collection("attempts").createIndex({ question_version_id: 1 });

  await db
    .collection("exposures")
    .createIndex({ exposure_id: 1 }, { unique: true });
  await db
    .collection("exposures")
    .createIndex({ learner_id: 1, question_version_id: 1, session_id: 1 });

  await db
    .collection("review_cycles")
    .createIndex({ cycle_id: 1 }, { unique: true });
  await db.collection("review_cycles").createIndex(
    { learner_id: 1, question_id: 1 },
    { unique: true, partialFilterExpression: { state: "ACTIVE" } },
  );
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
}
