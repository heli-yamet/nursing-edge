import { getDb } from "@/lib/mongo";
import type {
  TeachingDecision,
  TeachingDecisionState,
} from "@/lib/review-interview";

export type TeachingDecisionAction = "approve" | "ban";

export type TeachingTarget = {
  teaching_id: string;
  teaching_revision: number;
};

export type AdminTeachingRow = {
  teaching_id: string;
  teaching_revision: number;
  question_version: string;
  permanent_item_id: string;
  workbook_status: string;
  decision: "unapproved" | TeachingDecisionState;
  admin_id: string | null;
  acted_at: string | null;
};

export type TeachingDecisionStore = {
  hasTeaching(target: TeachingTarget): Promise<boolean>;
  save(decision: TeachingDecision): Promise<void>;
};

export type TeachingDecisionResult =
  | { ok: true; reason: null }
  | { ok: false; reason: string };

const SELECT_TEACHING = "Select teaching rows.";
const MISSING_TEACHING = "A selected teaching row is not stored. Nothing was changed.";

export function parseTeachingDecisionBody(
  body: unknown,
):
  | { ok: true; action: TeachingDecisionAction; targets: TeachingTarget[] }
  | { ok: false; reason: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, reason: SELECT_TEACHING };
  }
  const record = body as { action?: unknown; teachings?: unknown };
  if (record.action !== "approve" && record.action !== "ban") {
    return { ok: false, reason: "Choose Approve or Ban." };
  }
  if (!Array.isArray(record.teachings) || record.teachings.length === 0) {
    return { ok: false, reason: SELECT_TEACHING };
  }

  const targets: TeachingTarget[] = [];
  const seen = new Set<string>();
  for (const item of record.teachings) {
    const target = readTarget(item);
    if (!target) {
      return { ok: false, reason: SELECT_TEACHING };
    }
    const key = decisionKey(target);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    targets.push(target);
  }
  return { ok: true, action: record.action, targets };
}

/**
 * Writes one decision for each exact teaching id and revision.
 * The workbook row's approval stays untouched.
 */
export async function applyTeachingDecisions(
  store: TeachingDecisionStore,
  input: {
    targets: TeachingTarget[];
    action: TeachingDecisionAction;
    adminId: string;
    now: Date;
  },
): Promise<TeachingDecisionResult> {
  if (input.targets.length === 0 || input.adminId.trim() === "") {
    return { ok: false, reason: SELECT_TEACHING };
  }

  for (const target of input.targets) {
    if (!(await store.hasTeaching(target))) {
      return { ok: false, reason: MISSING_TEACHING };
    }
  }

  const state: TeachingDecisionState =
    input.action === "approve" ? "approved" : "banned";
  for (const target of input.targets) {
    await store.save({
      teaching_id: target.teaching_id,
      teaching_revision: target.teaching_revision,
      state,
      admin_id: input.adminId,
      acted_at: input.now,
    });
  }
  return { ok: true, reason: null };
}

export async function listAdminTeaching(): Promise<AdminTeachingRow[]> {
  const db = await getDb();
  const [rows, decisions] = await Promise.all([
    db
      .collection("precommit_teaching")
      .find(
        {},
        {
          projection: {
            _id: 0,
            teaching_id: 1,
            teaching_revision: 1,
            question_version: 1,
            permanent_item_id: 1,
            status: 1,
          },
        },
      )
      .toArray(),
    db
      .collection<TeachingDecision>("teaching_decisions")
      .find({}, { projection: { _id: 0 } })
      .toArray(),
  ]);

  const decisionByKey = new Map<string, TeachingDecision>();
  for (const decision of decisions) {
    if (decision.state !== "approved" && decision.state !== "banned") {
      continue;
    }
    decisionByKey.set(decisionKey(decision), decision);
  }

  const adminRows: AdminTeachingRow[] = [];
  for (const row of rows) {
    if (
      typeof row.teaching_id !== "string" ||
      typeof row.teaching_revision !== "number"
    ) {
      continue;
    }
    const target = {
      teaching_id: row.teaching_id,
      teaching_revision: row.teaching_revision,
    };
    const decision = decisionByKey.get(decisionKey(target));
    adminRows.push({
      teaching_id: row.teaching_id,
      teaching_revision: row.teaching_revision,
      question_version: text(row.question_version),
      permanent_item_id: text(row.permanent_item_id),
      workbook_status: text(row.status),
      decision: decision?.state ?? "unapproved",
      admin_id: decision?.admin_id ?? null,
      acted_at: decision ? toIso(decision.acted_at) : null,
    });
  }

  adminRows.sort((left, right) => {
    const id = left.teaching_id.localeCompare(right.teaching_id, "en", {
      numeric: true,
    });
    if (id !== 0) {
      return id;
    }
    return left.teaching_revision - right.teaching_revision;
  });
  return adminRows;
}

export function createMongoTeachingDecisionStore(): TeachingDecisionStore {
  return {
    async hasTeaching(target) {
      const db = await getDb();
      const found = await db.collection("precommit_teaching").findOne(
        {
          teaching_id: target.teaching_id,
          teaching_revision: target.teaching_revision,
        },
        { projection: { _id: 1 } },
      );
      return found !== null;
    },
    async save(decision) {
      const db = await getDb();
      await db.collection<TeachingDecision>("teaching_decisions").replaceOne(
        {
          teaching_id: decision.teaching_id,
          teaching_revision: decision.teaching_revision,
        },
        decision,
        { upsert: true },
      );
    },
  };
}

function readTarget(item: unknown): TeachingTarget | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const row = item as {
    teaching_id?: unknown;
    teaching_revision?: unknown;
  };
  if (typeof row.teaching_id !== "string" || row.teaching_id.trim() === "") {
    return null;
  }
  if (
    typeof row.teaching_revision !== "number" ||
    !Number.isInteger(row.teaching_revision)
  ) {
    return null;
  }
  return {
    teaching_id: row.teaching_id,
    teaching_revision: row.teaching_revision,
  };
}

function decisionKey(target: TeachingTarget): string {
  return `${target.teaching_id}\0${target.teaching_revision}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toIso(value: Date | string | undefined): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}
