import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;

type GlobalMongo = typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
  _adminIndexes?: Promise<void>;
};

function getClientPromise(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  const globalMongo = globalThis as GlobalMongo;

  if (process.env.NODE_ENV === "development") {
    if (!globalMongo._mongoClientPromise) {
      const client = new MongoClient(uri);
      globalMongo._mongoClientPromise = client.connect();
    }
    return globalMongo._mongoClientPromise;
  }

  return new MongoClient(uri).connect();
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  const db = client.db();
  const globalMongo = globalThis as GlobalMongo;
  if (!globalMongo._adminIndexes) {
    globalMongo._adminIndexes = ensureIndexes(db);
  }
  await globalMongo._adminIndexes;
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
}
