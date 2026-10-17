import { getDb } from "@/lib/mongo";

export type LinkKind = "transfer" | "support";
export type LinkDecisionAction = "approve" | "ban";
export type LinkDecisionState = "approved" | "banned";

export type LinkTarget = {
  link_kind: LinkKind;
  link_id: string;
  link_revision: number;
};

export type LinkDecision = LinkTarget & {
  state: LinkDecisionState;
  admin_id: string;
  acted_at: Date;
};

export type AdminLinkRow = {
  link_kind: LinkKind;
  link_id: string;
  link_revision: number;
  workbook_status: string;
  from_ref: string;
  to_ref: string;
  from_question_version: string | null;
  to_question_version: string | null;
  decision: "unapproved" | LinkDecisionState;
  admin_id: string | null;
  acted_at: string | null;
};

export type LinkDecisionStore = {
  hasLink(target: LinkTarget): Promise<boolean>;
  save(decision: LinkDecision): Promise<void>;
};

export type LinkDecisionResult =
  | { ok: true; reason: null }
  | { ok: false; reason: string };

const SELECT_LINKS = "Select links.";
const MISSING_LINK = "A selected link is not stored. Nothing was changed.";

export function parseLinkDecisionBody(
  body: unknown,
):
  | { ok: true; action: LinkDecisionAction; targets: LinkTarget[] }
  | { ok: false; reason: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, reason: SELECT_LINKS };
  }
  const record = body as { action?: unknown; links?: unknown };
  if (record.action !== "approve" && record.action !== "ban") {
    return { ok: false, reason: "Choose Approve or Ban." };
  }
  if (!Array.isArray(record.links) || record.links.length === 0) {
    return { ok: false, reason: SELECT_LINKS };
  }

  const targets: LinkTarget[] = [];
  const seen = new Set<string>();
  for (const item of record.links) {
    const target = readTarget(item);
    if (!target) {
      return { ok: false, reason: SELECT_LINKS };
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
 * Writes one decision for each exact link id and revision.
 * The workbook row's approval stays untouched.
 */
export async function applyLinkDecisions(
  store: LinkDecisionStore,
  input: {
    targets: LinkTarget[];
    action: LinkDecisionAction;
    adminId: string;
    now: Date;
  },
): Promise<LinkDecisionResult> {
  if (input.targets.length === 0 || input.adminId.trim() === "") {
    return { ok: false, reason: SELECT_LINKS };
  }

  for (const target of input.targets) {
    if (!(await store.hasLink(target))) {
      return { ok: false, reason: MISSING_LINK };
    }
  }

  const state: LinkDecisionState =
    input.action === "approve" ? "approved" : "banned";
  for (const target of input.targets) {
    await store.save({
      link_kind: target.link_kind,
      link_id: target.link_id,
      link_revision: target.link_revision,
      state,
      admin_id: input.adminId,
      acted_at: input.now,
    });
  }
  return { ok: true, reason: null };
}

export async function listAdminLinks(): Promise<AdminLinkRow[]> {
  const db = await getDb();
  const [transfers, supports, decisions, maps] = await Promise.all([
    db
      .collection("transfer_links")
      .find(
        {},
        {
          projection: {
            _id: 0,
            link_id: 1,
            link_revision: 1,
            status: 1,
            anchor_map_id: 1,
            anchor_map_revision: 1,
            candidate_map_id: 1,
            candidate_map_revision: 1,
          },
        },
      )
      .toArray(),
    db
      .collection("support_links")
      .find(
        {},
        {
          projection: {
            _id: 0,
            support_link_id: 1,
            link_revision: 1,
            status: 1,
            clinical_question_version: 1,
            ap_question_version: 1,
          },
        },
      )
      .toArray(),
    db
      .collection<LinkDecision>("link_decisions")
      .find({}, { projection: { _id: 0 } })
      .toArray(),
    db
      .collection("maps")
      .find(
        {},
        {
          projection: {
            _id: 0,
            map_id: 1,
            map_revision: 1,
            question_version: 1,
          },
        },
      )
      .toArray(),
  ]);

  const questionVersionByMap = new Map<string, string>();
  for (const map of maps) {
    if (
      typeof map.map_id !== "string" ||
      typeof map.map_revision !== "number" ||
      typeof map.question_version !== "string"
    ) {
      continue;
    }
    questionVersionByMap.set(
      mapKey(map.map_id, map.map_revision),
      map.question_version,
    );
  }

  const decisionByKey = new Map<string, LinkDecision>();
  for (const decision of decisions) {
    if (decision.state !== "approved" && decision.state !== "banned") {
      continue;
    }
    decisionByKey.set(decisionKey(decision), decision);
  }

  const rows: AdminLinkRow[] = [];
  for (const link of transfers) {
    if (typeof link.link_id !== "string" || typeof link.link_revision !== "number") {
      continue;
    }
    rows.push(
      toRow(
        {
          link_kind: "transfer",
          link_id: link.link_id,
          link_revision: link.link_revision,
        },
        text(link.status),
        text(link.anchor_map_id),
        text(link.candidate_map_id),
        questionVersionByMap.get(
          mapKey(text(link.anchor_map_id), link.anchor_map_revision),
        ) ?? "",
        questionVersionByMap.get(
          mapKey(text(link.candidate_map_id), link.candidate_map_revision),
        ) ?? "",
        decisionByKey,
      ),
    );
  }
  for (const link of supports) {
    if (
      typeof link.support_link_id !== "string" ||
      typeof link.link_revision !== "number"
    ) {
      continue;
    }
    rows.push(
      toRow(
        {
          link_kind: "support",
          link_id: link.support_link_id,
          link_revision: link.link_revision,
        },
        text(link.status),
        text(link.clinical_question_version),
        text(link.ap_question_version),
        text(link.clinical_question_version),
        text(link.ap_question_version),
        decisionByKey,
      ),
    );
  }

  rows.sort((left, right) => {
    if (left.link_kind !== right.link_kind) {
      return left.link_kind === "transfer" ? -1 : 1;
    }
    const id = left.link_id.localeCompare(right.link_id, "en", {
      numeric: true,
    });
    if (id !== 0) {
      return id;
    }
    return left.link_revision - right.link_revision;
  });
  return rows;
}

export function createMongoLinkDecisionStore(): LinkDecisionStore {
  return {
    async hasLink(target) {
      const db = await getDb();
      if (target.link_kind === "transfer") {
        const found = await db.collection("transfer_links").findOne(
          { link_id: target.link_id, link_revision: target.link_revision },
          { projection: { _id: 1 } },
        );
        return found !== null;
      }
      const found = await db.collection("support_links").findOne(
        {
          support_link_id: target.link_id,
          link_revision: target.link_revision,
        },
        { projection: { _id: 1 } },
      );
      return found !== null;
    },
    async save(decision) {
      const db = await getDb();
      await db.collection<LinkDecision>("link_decisions").replaceOne(
        {
          link_kind: decision.link_kind,
          link_id: decision.link_id,
          link_revision: decision.link_revision,
        },
        decision,
        { upsert: true },
      );
    },
  };
}

function readTarget(item: unknown): LinkTarget | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const row = item as {
    link_kind?: unknown;
    link_id?: unknown;
    link_revision?: unknown;
  };
  if (row.link_kind !== "transfer" && row.link_kind !== "support") {
    return null;
  }
  if (typeof row.link_id !== "string" || row.link_id.trim() === "") {
    return null;
  }
  if (typeof row.link_revision !== "number" || !Number.isInteger(row.link_revision)) {
    return null;
  }
  return {
    link_kind: row.link_kind,
    link_id: row.link_id,
    link_revision: row.link_revision,
  };
}

function decisionKey(target: LinkTarget): string {
  return `${target.link_kind}\0${target.link_id}\0${target.link_revision}`;
}

function mapKey(mapId: string, mapRevision: unknown): string {
  return `${mapId}\0${typeof mapRevision === "number" ? mapRevision : ""}`;
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

function toRow(
  target: LinkTarget,
  workbookStatus: string,
  fromRef: string,
  toRef: string,
  fromQuestionVersion: string,
  toQuestionVersion: string,
  decisionByKey: Map<string, LinkDecision>,
): AdminLinkRow {
  const decision = decisionByKey.get(decisionKey(target));
  return {
    ...target,
    workbook_status: workbookStatus,
    from_ref: fromRef,
    to_ref: toRef,
    from_question_version: fromQuestionVersion || null,
    to_question_version: toQuestionVersion || null,
    decision: decision?.state ?? "unapproved",
    admin_id: decision?.admin_id ?? null,
    acted_at: decision ? toIso(decision.acted_at) : null,
  };
}
