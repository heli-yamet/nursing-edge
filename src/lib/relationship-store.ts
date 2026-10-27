import { getDb } from "@/lib/mongo";

export type RelationshipKey = Record<string, string | number>;

export type RelationshipStore = {
  find(
    collection: string,
    key: RelationshipKey,
  ): Promise<Record<string, unknown> | null>;
  /** Every key in one call must use the same fields. */
  findMany(
    collection: string,
    keys: RelationshipKey[],
  ): Promise<Record<string, unknown>[]>;
  insert(collection: string, doc: Record<string, unknown>): Promise<void>;
  insertMany(collection: string, docs: Record<string, unknown>[]): Promise<void>;
  /** Every key in one call must use the same fields. Returns how many were removed. */
  deleteMany(collection: string, keys: RelationshipKey[]): Promise<number>;
};

export type MemoryRelationshipStore = RelationshipStore & {
  inserts: number;
  roundTrips: number;
  docs: Map<string, Record<string, unknown>[]>;
};

const FIND_CHUNK = 500;
const INSERT_CHUNK = 1000;

/** Same fields and values give the same string, whatever the field order. */
export function keySignature(
  doc: Record<string, unknown>,
  fields: string[],
): string {
  return JSON.stringify([...fields].sort().map((field) => [field, doc[field]]));
}

function matches(doc: Record<string, unknown>, key: RelationshipKey): boolean {
  return Object.entries(key).every(([field, value]) => doc[field] === value);
}

export function createMemoryRelationshipStore(): MemoryRelationshipStore {
  const docs = new Map<string, Record<string, unknown>[]>();
  const store: MemoryRelationshipStore = {
    docs,
    inserts: 0,
    roundTrips: 0,
    async find(collection, key) {
      store.roundTrips += 1;
      const found = (docs.get(collection) ?? []).find((doc) => matches(doc, key));
      return found ? { ...found } : null;
    },
    async findMany(collection, keys) {
      if (keys.length === 0) {
        return [];
      }
      store.roundTrips += 1;
      const fields = Object.keys(keys[0] ?? {});
      const wanted = new Set(keys.map((key) => keySignature(key, fields)));
      return (docs.get(collection) ?? [])
        .filter((doc) => wanted.has(keySignature(doc, fields)))
        .map((doc) => ({ ...doc }));
    },
    async insert(collection, doc) {
      store.roundTrips += 1;
      store.inserts += 1;
      const rows = docs.get(collection) ?? [];
      rows.push({ ...doc });
      docs.set(collection, rows);
    },
    async insertMany(collection, items) {
      if (items.length === 0) {
        return;
      }
      store.roundTrips += 1;
      store.inserts += items.length;
      const rows = docs.get(collection) ?? [];
      rows.push(...items.map((doc) => ({ ...doc })));
      docs.set(collection, rows);
    },
    async deleteMany(collection, keys) {
      if (keys.length === 0) {
        return 0;
      }
      store.roundTrips += 1;
      const fields = Object.keys(keys[0] ?? {});
      const wanted = new Set(keys.map((key) => keySignature(key, fields)));
      const rows = docs.get(collection) ?? [];
      const kept = rows.filter((doc) => !wanted.has(keySignature(doc, fields)));
      docs.set(collection, kept);
      return rows.length - kept.length;
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
    async findMany(collection, keys) {
      const found: Record<string, unknown>[] = [];
      const fields = Object.keys(keys[0] ?? {});
      for (let start = 0; start < keys.length; start += FIND_CHUNK) {
        const chunk = keys.slice(start, start + FIND_CHUNK);
        const field = fields[0];
        const filter =
          fields.length === 1 && field
            ? { [field]: { $in: chunk.map((key) => key[field]) } }
            : { $or: chunk };
        const docs = await db
          .collection(collection)
          .find(filter, { projection: { _id: 0 } })
          .toArray();
        found.push(...(docs as Record<string, unknown>[]));
      }
      return found;
    },
    async insert(collection, doc) {
      await db.collection(collection).insertOne({ ...doc });
    },
    async insertMany(collection, docs) {
      for (let start = 0; start < docs.length; start += INSERT_CHUNK) {
        const chunk = docs.slice(start, start + INSERT_CHUNK).map((doc) => ({ ...doc }));
        await db.collection(collection).insertMany(chunk, { ordered: true });
      }
    },
    async deleteMany(collection, keys) {
      let removed = 0;
      const fields = Object.keys(keys[0] ?? {});
      for (let start = 0; start < keys.length; start += FIND_CHUNK) {
        const chunk = keys.slice(start, start + FIND_CHUNK);
        const field = fields[0];
        const filter =
          fields.length === 1 && field
            ? { [field]: { $in: chunk.map((key) => key[field]) } }
            : { $or: chunk };
        const result = await db.collection(collection).deleteMany(filter);
        removed += result.deletedCount;
      }
      return removed;
    },
  };
}
