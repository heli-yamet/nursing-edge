import { getDb } from "@/lib/mongo";

export type RelationshipKey = Record<string, string | number>;

export type RelationshipStore = {
  find(
    collection: string,
    key: RelationshipKey,
  ): Promise<Record<string, unknown> | null>;
  insert(collection: string, doc: Record<string, unknown>): Promise<void>;
};

export type MemoryRelationshipStore = RelationshipStore & {
  inserts: number;
  docs: Map<string, Record<string, unknown>[]>;
};

function matches(doc: Record<string, unknown>, key: RelationshipKey): boolean {
  return Object.entries(key).every(([field, value]) => doc[field] === value);
}

export function createMemoryRelationshipStore(): MemoryRelationshipStore {
  const docs = new Map<string, Record<string, unknown>[]>();
  const store: MemoryRelationshipStore = {
    docs,
    inserts: 0,
    async find(collection, key) {
      const found = (docs.get(collection) ?? []).find((doc) => matches(doc, key));
      return found ? { ...found } : null;
    },
    async insert(collection, doc) {
      store.inserts += 1;
      const rows = docs.get(collection) ?? [];
      rows.push({ ...doc });
      docs.set(collection, rows);
    },
  };
  return store;
}

export async function createMongoRelationshipStore(): Promise<RelationshipStore> {
  const db = await getDb();
  return {
    async find(collection, key) {
      const doc = await db
        .collection(collection)
        .findOne(key, { projection: { _id: 0 } });
      if (!doc) {
        return null;
      }
      return doc as Record<string, unknown>;
    },
    async insert(collection, doc) {
      await db.collection(collection).insertOne(doc);
    },
  };
}
