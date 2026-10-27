import {
  learnerTopicForName,
  topicKeyMismatch,
} from "@/lib/learner-topics";
import {
  keySignature,
  type RelationshipKey,
  type RelationshipStore,
} from "@/lib/relationship-store";
import type { RuntimeRoleName } from "@/lib/relationship-types";
import { sheetRowsByName, type SheetRow } from "@/lib/xlsx-rows";

export type DomainCounts = {
  passed: number;
  failed: number;
  unchanged: number;
  failures: { key: string; error: string }[];
};

export type RelationshipDomains = {
  mapping_and_exposure: DomainCounts;
  evidence_and_teaching: DomainCounts;
  runtime_binding: DomainCounts;
};

export type WorkbookRoleBasis =
  | "AP_ITEMS"
  | "FILE_NAME"
  | "DEFAULT"
  | "CALIBRATION_UPLOAD";

/** "Upload and stage" is `bank`. "Upload as Calibration" is `calibration`. */
export type ImportPurpose = "bank" | "calibration";

export type WorkbookRole = {
  role: RuntimeRoleName | null;
  basis: WorkbookRoleBasis | null;
  bound: boolean;
  warning: string | null;
};

export type RelationshipImportResult = {
  domains: RelationshipDomains;
  workbook_role: WorkbookRole;
};

type DetectedRole =
  | { role: RuntimeRoleName; basis: WorkbookRoleBasis; warning: string | null }
  | { role: null; error: string };

type ResolvedRole =
  | DetectedRole
  | { role: null; basis: "CALIBRATION_UPLOAD"; warning: string | null };

const AP_QUESTION_ROLE = "APPLIED_PATHOPHYSIOLOGY";
const AP_NAME_TOKEN = /(^|[^A-Za-z])AP\d*([^A-Za-z]|$)/;

const MAPPING_SHEETS = [
  "CJ_CLASSES",
  "JUDGMENTS",
  "FAMILIES",
  "CONTEXTS",
  "VARIANT_GROUPS",
  "TOPIC_REGISTRY",
  "TOPIC_BINDINGS",
  "MAP_ROWS",
  "TRANSFER_LINKS",
  "LINK_ELIGIBILITY",
  "EXPOSURE_DEPENDENCIES",
  "DEPENDENCY_RETIREMENTS",
];

const TEACHING_SHEETS = ["PRECOMMIT_TEACHING", "EVIDENCE_BINDINGS"];

const PHYSIOLOGY_SHEETS = [
  "MECHANISMS",
  "SUPPORT_LINKS",
  "AP_VARIANT_GROUPS",
];

/** Every sheet this importer reads. The reader skips the rest. */
export const RELATIONSHIP_SHEETS = [
  ...MAPPING_SHEETS,
  ...TEACHING_SHEETS,
  "AP_ITEMS",
  ...PHYSIOLOGY_SHEETS,
];

const AP_SUPPORT_STATUSES = new Set([
  "REVIEWED_CANDIDATE_NOT_APPROVED",
  "RETIRED_NOT_APPROVED",
]);

const AP_VARIANT_STATUSES = new Set([
  "CANDIDATE",
  "DRAFT",
  "REVIEWED",
  "RETIRED",
]);

type ReadyRow = {
  label: string;
  key: RelationshipKey;
  doc: Record<string, unknown>;
};

type FieldKind = "id" | "text" | "int" | "bool" | "nullish";

type RowCheck = (doc: Record<string, unknown>) => string | null;

export function emptyDomainCounts(): DomainCounts {
  return { passed: 0, failed: 0, unchanged: 0, failures: [] };
}

function sourceBaseName(source: string): string {
  const trimmed = source.trim().replace(/\\/g, "/");
  const base = trimmed.split("/").pop() ?? "";
  return base || "workbook.xlsx";
}

/** AP_ITEMS decides AP. Otherwise "sibling" in the file name decides sibling. Everything else is clinical core. */
export function detectWorkbookRole(
  sheets: Map<string, SheetRow[]>,
  source: string,
): DetectedRole {
  const name = sourceBaseName(source);
  const nameSaysSibling = /sibling/i.test(name);
  const apItems = sheetRowsByName(sheets, "AP_ITEMS") ?? [];
  if (apItems.length > 0) {
    const error = apItemsError(apItems, sheetRowsByName(sheets, "QUESTIONS") ?? []);
    if (error) {
      return { role: null, error };
    }
    return {
      role: "AP_REINFORCEMENT",
      basis: "AP_ITEMS",
      warning: nameSaysSibling
        ? "The file name says Sibling, but AP_ITEMS marks these as physiology questions. Bound as AP."
        : null,
    };
  }
  if (nameSaysSibling) {
    return { role: "CLINICAL_SIBLING_RESERVED", basis: "FILE_NAME", warning: null };
  }
  return {
    role: "CLINICAL_CORE",
    basis: "DEFAULT",
    warning: AP_NAME_TOKEN.test(name)
      ? "The file name looks like AP, but there is no AP_ITEMS sheet. Bound as clinical core."
      : null,
  };
}

function apItemsError(apItems: SheetRow[], questions: SheetRow[]): string | null {
  const versions = new Set<string>();
  for (const [index, row] of apItems.entries()) {
    const role = (row.question_role ?? "").trim();
    if (role !== AP_QUESTION_ROLE) {
      return `AP_ITEMS row ${index + 1} has question_role ${role || "blank"}, not ${AP_QUESTION_ROLE}`;
    }
    versions.add((row.question_version ?? "").trim());
  }
  const missing = questions
    .map((row) => (row.question_version ?? "").trim())
    .filter((version) => version && !versions.has(version));
  if (missing.length > 0) {
    return `${missing.length} QUESTIONS rows are missing from AP_ITEMS, starting with ${missing[0]}`;
  }
  return null;
}

function hasRows(sheets: Map<string, SheetRow[]>, names: string[]): boolean {
  return names.some((name) => (sheetRowsByName(sheets, name)?.length ?? 0) > 0);
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (key === "_id") {
        continue;
      }
      sorted[key] = sortValue(source[key]);
    }
    return sorted;
  }
  return value;
}

function fail(domain: DomainCounts, key: string, error: string): void {
  domain.failed += 1;
  domain.failures.push({ key, error });
}

class RowReader {
  readonly errors: string[] = [];

  constructor(private readonly row: SheetRow) {}

  private raw(field: string): string {
    return (this.row[field] ?? "").trim();
  }

  id(field: string): string {
    const value = this.raw(field);
    if (!value) {
      this.errors.push(`${field} is required`);
    }
    return value;
  }

  text(field: string): string {
    return this.raw(field);
  }

  int(field: string): number {
    const value = this.raw(field);
    if (!/^-?\d+$/.test(value)) {
      this.errors.push(`${field} must be an integer`);
      return 0;
    }
    return Number(value);
  }

  bool(field: string): boolean {
    const value = this.raw(field).toUpperCase();
    if (value === "TRUE" || value === "1" || value === "YES" || value === "Y") {
      return true;
    }
    if (value === "FALSE" || value === "0" || value === "NO" || value === "N") {
      return false;
    }
    this.errors.push(`${field} must be true or false`);
    return false;
  }

  nullish(field: string): string | null {
    const value = this.raw(field);
    if (!value || value.toLowerCase() === "null") {
      return null;
    }
    return value;
  }

  fields(spec: [string, FieldKind][]): Record<string, unknown> {
    const doc: Record<string, unknown> = {};
    for (const [field, kind] of spec) {
      if (kind === "id") {
        doc[field] = this.id(field);
      } else if (kind === "text") {
        doc[field] = this.text(field);
      } else if (kind === "int") {
        doc[field] = this.int(field);
      } else if (kind === "bool") {
        doc[field] = this.bool(field);
      } else {
        doc[field] = this.nullish(field);
      }
    }
    return doc;
  }
}

async function commitRows(
  store: RelationshipStore,
  collection: string,
  rows: ReadyRow[],
  domain: DomainCounts,
): Promise<void> {
  const fields = Object.keys(rows[0]?.key ?? {});
  const groups = new Map<string, ReadyRow[]>();
  for (const row of rows) {
    const id = keySignature(row.key, fields);
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }
  if (groups.size === 0) {
    return;
  }

  const storedById = new Map<string, string>();
  const found = await store.findMany(
    collection,
    [...groups.values()].flatMap((group) => (group[0] ? [group[0].key] : [])),
  );
  for (const doc of found) {
    const id = keySignature(doc, fields);
    if (!storedById.has(id)) {
      storedById.set(id, stableJson(doc));
    }
  }

  const toInsert: Record<string, unknown>[] = [];
  for (const [id, group] of groups) {
    const first = group[0];
    if (!first) {
      continue;
    }
    const storedJson = storedById.get(id) ?? null;
    const payloads = new Set(group.map((row) => stableJson(row.doc)));

    if (payloads.size > 1) {
      for (const row of group) {
        if (storedJson && stableJson(row.doc) === storedJson) {
          domain.unchanged += 1;
        } else {
          fail(
            domain,
            row.label,
            `${row.label} conflicts with another row for the same key`,
          );
        }
      }
      continue;
    }

    const incoming = stableJson(first.doc);
    if (storedJson === incoming) {
      domain.unchanged += group.length;
      continue;
    }
    if (storedJson) {
      for (const row of group) {
        fail(
          domain,
          row.label,
          `${row.label} already exists with a different payload`,
        );
      }
      continue;
    }

    toInsert.push(first.doc);
    domain.passed += 1;
    domain.unchanged += group.length - 1;
  }
  await store.insertMany(collection, toInsert);
}

function readSpec(
  row: SheetRow,
  spec: [string, FieldKind][],
): { doc: Record<string, unknown> } | { error: string } {
  const reader = new RowReader(row);
  const doc = reader.fields(spec);
  if (reader.errors.length > 0) {
    return { error: reader.errors.join("; ") };
  }
  return { doc };
}

async function importSpecSheet(
  store: RelationshipStore,
  sheets: Map<string, SheetRow[]>,
  domain: DomainCounts,
  input: {
    sheet: string;
    collection: string;
    spec: [string, FieldKind][];
    key: (doc: Record<string, unknown>) => RelationshipKey;
    /** Loads what the sheet references once, then checks each row without a lookup. */
    check?: (docs: Record<string, unknown>[]) => Promise<RowCheck>;
  },
): Promise<void> {
  const rows = sheetRowsByName(sheets, input.sheet);
  if (!rows) {
    return;
  }
  const parsed: { fallback: string; doc: Record<string, unknown> }[] = [];
  for (const [index, row] of rows.entries()) {
    const read = readSpec(row, input.spec);
    const fallback = `${input.sheet} row ${index + 1}`;
    if ("error" in read) {
      fail(domain, fallback, read.error);
      continue;
    }
    parsed.push({ fallback, doc: read.doc });
  }
  const check = input.check
    ? await input.check(parsed.map((item) => item.doc))
    : null;
  const ready: ReadyRow[] = [];
  for (const { fallback, doc } of parsed) {
    const refError = check ? check(doc) : null;
    if (refError) {
      fail(domain, fallback, refError);
      continue;
    }
    const key = input.key(doc);
    ready.push({
      label: `${input.sheet} ${Object.values(key).join(" ")}`,
      key,
      doc,
    });
  }
  await commitRows(store, input.collection, ready, domain);
}

/** One query for every key a sheet references. Keys must share fields. */
async function knownKeys(
  store: RelationshipStore,
  collection: string,
  keys: RelationshipKey[],
): Promise<(key: RelationshipKey) => boolean> {
  const fields = Object.keys(keys[0] ?? {});
  const unique = new Map<string, RelationshipKey>();
  for (const key of keys) {
    unique.set(keySignature(key, fields), key);
  }
  const found = new Set(
    (await store.findMany(collection, [...unique.values()])).map((doc) =>
      keySignature(doc, fields),
    ),
  );
  return (key) => found.has(keySignature(key, fields));
}

function textKey(doc: Record<string, unknown>, field: string): string {
  return String(doc[field] ?? "");
}

function numberKey(doc: Record<string, unknown>, field: string): number {
  return Number(doc[field]);
}

export async function importWorkbookRelationships(input: {
  sheets: Map<string, SheetRow[]>;
  source: string;
  store: RelationshipStore | null;
  purpose?: ImportPurpose;
  /** Calibration only: the versions the content import stored. Their role rows are removed. */
  storedVersionIds?: readonly string[];
}): Promise<RelationshipImportResult> {
  const domains: RelationshipDomains = {
    mapping_and_exposure: emptyDomainCounts(),
    evidence_and_teaching: emptyDomainCounts(),
    runtime_binding: emptyDomainCounts(),
  };
  const calibration = input.purpose === "calibration";
  const clearVersionIds = calibration ? [...new Set(input.storedVersionIds ?? [])] : [];
  const detected: ResolvedRole = calibration
    ? { role: null, basis: "CALIBRATION_UPLOAD", warning: null }
    : detectWorkbookRole(input.sheets, input.source);
  const role = detected.role;
  const questions = sheetRowsByName(input.sheets, "QUESTIONS") ?? [];
  const hasRelationshipSheets = hasRows(input.sheets, [
    ...MAPPING_SHEETS,
    ...TEACHING_SHEETS,
  ]);
  // A content-only workbook must leave stored mappings alone, so it gets no clinical core row.
  const bindRole =
    role === "CLINICAL_CORE" && !hasRelationshipSheets ? null : role;
  const workbookRole: WorkbookRole =
    "error" in detected
      ? {
          role: null,
          basis: null,
          bound: false,
          warning: `${detected.error}. No role was bound.`,
        }
      : {
          role: detected.role,
          basis: detected.basis,
          bound: bindRole !== null && questions.length > 0,
          warning: detected.warning,
        };
  if ("error" in detected) {
    fail(domains.runtime_binding, "AP_ITEMS", workbookRole.warning ?? detected.error);
  }
  const result = { domains, workbook_role: workbookRole };
  const needsStore =
    (questions.length > 0 && bindRole !== null) ||
    clearVersionIds.length > 0 ||
    hasRelationshipSheets ||
    (role === "AP_REINFORCEMENT" && hasRows(input.sheets, PHYSIOLOGY_SHEETS));
  if (!needsStore) {
    return result;
  }
  if (!input.store) {
    throw new Error(
      "Relationship store is required when the workbook has mapping sheets",
    );
  }
  const store = input.store;
  const mapping = domains.mapping_and_exposure;
  const teaching = domains.evidence_and_teaching;

  await importSpecSheet(store, input.sheets, mapping, {
    sheet: "CJ_CLASSES",
    collection: "cj_classes",
    spec: [
      ["class_id", "id"],
      ["label", "text"],
      ["core_question", "text"],
    ],
    key: (doc) => ({ class_id: textKey(doc, "class_id") }),
  });

  await importSpecSheet(store, input.sheets, mapping, {
    sheet: "JUDGMENTS",
    collection: "judgments",
    spec: [
      ["judgment_id", "id"],
      ["class_id", "id"],
      ["label", "text"],
      ["definition", "text"],
    ],
    key: (doc) => ({ judgment_id: textKey(doc, "judgment_id") }),
    check: async (docs) => {
      const classKey = (doc: Record<string, unknown>) => ({
        class_id: textKey(doc, "class_id"),
      });
      const classes = await knownKeys(store, "cj_classes", docs.map(classKey));
      return (doc) =>
        classes(classKey(doc)) ? null : `missing cj class ${textKey(doc, "class_id")}`;
    },
  });

  await importSpecSheet(store, input.sheets, mapping, {
    sheet: "FAMILIES",
    collection: "families",
    spec: [
      ["family_id", "id"],
      ["family_revision", "int"],
      ["status", "id"],
      ["label", "text"],
      ["primary_judgment_id", "id"],
      ["response_target", "text"],
      ["decision_rule", "text"],
      ["evidence_pivot", "text"],
      ["inclusion_boundary", "text"],
      ["exclusion_boundary", "text"],
      ["counterfactual_boundary", "text"],
      ["approval", "nullish"],
      ["provenance", "nullish"],
    ],
    key: (doc) => ({
      family_id: textKey(doc, "family_id"),
      family_revision: numberKey(doc, "family_revision"),
    }),
    check: async (docs) => {
      const judgments = await knownKeys(store, "judgments", docs.map(judgmentKey));
      return (doc) =>
        judgments(judgmentKey(doc))
          ? null
          : `missing judgment ${textKey(doc, "primary_judgment_id")}`;
    },
  });

  await importSpecSheet(store, input.sheets, mapping, {
    sheet: "CONTEXTS",
    collection: "contexts",
    spec: [
      ["context_id", "id"],
      ["context_revision", "int"],
      ["status", "id"],
      ["label", "text"],
      ["clinical_situation", "text"],
      ["scope_notes", "nullish"],
      ["approval", "nullish"],
    ],
    key: (doc) => ({
      context_id: textKey(doc, "context_id"),
      context_revision: numberKey(doc, "context_revision"),
    }),
  });

  await importSpecSheet(store, input.sheets, mapping, {
    sheet: "VARIANT_GROUPS",
    collection: "variant_groups",
    spec: [
      ["variant_group_id", "id"],
      ["variant_group_revision", "int"],
      ["status", "id"],
      ["member_map_ids_json", "text"],
      ["member_permanent_item_ids_json", "text"],
      ["purpose", "text"],
      ["completeness", "text"],
      ["approval_json", "nullish"],
    ],
    key: (doc) => ({
      variant_group_id: textKey(doc, "variant_group_id"),
      variant_group_revision: numberKey(doc, "variant_group_revision"),
    }),
  });

  await importTopicRegistry(store, input.sheets, mapping);
  await importTopicBindings(store, input.sheets, mapping);

  await importSpecSheet(store, input.sheets, mapping, {
    sheet: "MAP_ROWS",
    collection: "maps",
    spec: [
      ["map_id", "id"],
      ["map_revision", "int"],
      ["status", "id"],
      ["question_version", "id"],
      ["permanent_item_id", "id"],
      ["source_content_sha256", "text"],
      ["family_id", "id"],
      ["family_revision", "int"],
      ["primary_judgment_id", "id"],
      ["secondary_judgment_ids", "text"],
      ["track", "text"],
      ["format", "text"],
      ["assessment_basis", "text"],
      ["context_id", "id"],
      ["context_revision", "int"],
      ["variant_group_id", "nullish"],
      ["time_structure", "text"],
      ["knowledge_dependencies", "text"],
      ["decision_target", "text"],
      ["comparison_boundary", "text"],
      ["keyed_closure", "text"],
      ["evidence", "text"],
      ["approval", "nullish"],
    ],
    key: (doc) => ({
      map_id: textKey(doc, "map_id"),
      map_revision: numberKey(doc, "map_revision"),
    }),
    check: (docs) => mapReferenceCheck(store, docs),
  });

  await importSpecSheet(store, input.sheets, mapping, {
    sheet: "TRANSFER_LINKS",
    collection: "transfer_links",
    spec: [
      ["link_id", "id"],
      ["link_revision", "int"],
      ["status", "id"],
      ["anchor_map_id", "id"],
      ["anchor_map_revision", "int"],
      ["candidate_map_id", "id"],
      ["candidate_map_revision", "int"],
      ["same_assessed_boundary", "bool"],
      ["context_difference", "text"],
      ["dependency_comparison", "text"],
      ["nonclone_justification", "text"],
      ["cue_leakage_review", "text"],
      ["scope_compatibility", "text"],
      ["approval", "nullish"],
    ],
    key: (doc) => ({
      link_id: textKey(doc, "link_id"),
      link_revision: numberKey(doc, "link_revision"),
    }),
  });

  await importSpecSheet(store, input.sheets, mapping, {
    sheet: "LINK_ELIGIBILITY",
    collection: "link_eligibility",
    spec: [
      ["evaluation_id", "id"],
      ["evaluation_revision", "int"],
      ["link_id", "id"],
      ["link_revision", "int"],
      ["anchor_permanent_item_id", "text"],
      ["anchor_question_version", "text"],
      ["candidate_permanent_item_id", "text"],
      ["candidate_question_version", "text"],
      ["anchor_topic_key", "text"],
      ["candidate_topic_key", "text"],
      ["static_disposition", "text"],
      ["failed_gates", "text"],
      ["owner_overlap_dependencies", "text"],
      ["exposure_dependencies", "text"],
      ["approval_status", "text"],
      ["publication_status", "text"],
      ["learner_exposure_tested", "bool"],
      ["runtime_eligible", "bool"],
      ["fallback", "text"],
    ],
    key: (doc) => ({
      evaluation_id: textKey(doc, "evaluation_id"),
      evaluation_revision: numberKey(doc, "evaluation_revision"),
    }),
    check: async (docs) => {
      const linkKey = (doc: Record<string, unknown>) => ({
        link_id: textKey(doc, "link_id"),
        link_revision: numberKey(doc, "link_revision"),
      });
      const links = await knownKeys(store, "transfer_links", docs.map(linkKey));
      return (doc) =>
        links(linkKey(doc)) ? null : `missing transfer link ${textKey(doc, "link_id")}`;
    },
  });

  await importSpecSheet(store, input.sheets, mapping, {
    sheet: "EXPOSURE_DEPENDENCIES",
    collection: "exposure_dependencies",
    spec: [
      ["dependency_id", "id"],
      ["dependency_revision", "int"],
      ["target_permanent_item_id", "text"],
      ["target_question_version", "text"],
      ["target_content_sha256", "text"],
      ["related_permanent_item_id", "text"],
      ["related_question_version", "text"],
      ["related_content_sha256", "text"],
      ["related_variant_group_id", "nullish"],
      ["relation_type", "text"],
      ["exposure_scope", "text"],
      ["source_kind", "text"],
      ["source_locator", "text"],
      ["reason", "text"],
      ["status", "id"],
      ["approval_json", "nullish"],
      ["routing_active", "bool"],
      ["payload_sha256", "text"],
    ],
    key: (doc) => ({
      dependency_id: textKey(doc, "dependency_id"),
      dependency_revision: numberKey(doc, "dependency_revision"),
    }),
  });

  if (role === "CLINICAL_SIBLING_RESERVED") {
    await importSpecSheet(store, input.sheets, mapping, {
      sheet: "DEPENDENCY_RETIREMENTS",
      collection: "dependency_retirements",
      spec: [
        ["retirement_id", "id"],
        ["retirement_revision", "int"],
        ["dependency_id", "id"],
        ["dependency_revision", "int"],
        ["old_target_question_version", "text"],
        ["replacement_target_question_version", "text"],
        ["status", "id"],
        ["reason", "text"],
        ["prior_record_json", "text"],
        ["preserve_old_target_restriction", "bool"],
        ["preserve_own_all_version_exposure", "bool"],
        ["approval_json", "nullish"],
        ["routing_active", "bool"],
      ],
      key: (doc) => ({
        retirement_id: textKey(doc, "retirement_id"),
        retirement_revision: numberKey(doc, "retirement_revision"),
      }),
    });
  }

  if (role === "AP_REINFORCEMENT") {
    await importPhysiology(store, input.sheets, questions, mapping);
  }

  await importSpecSheet(store, input.sheets, teaching, {
    sheet: "PRECOMMIT_TEACHING",
    collection: "precommit_teaching",
    spec: [
      ["teaching_id", "id"],
      ["teaching_revision", "int"],
      ["permanent_item_id", "id"],
      ["question_version", "id"],
      ["source_content_sha256", "text"],
      ["source_review_record", "text"],
      ["question_role", "text"],
      ["primary_prompt", "text"],
      ["learner_commitment_prompt", "text"],
      ["precommit_feedback", "text"],
      ["feedback_template_id", "text"],
      ["feedback_mode", "text"],
      ["optional_second_prompt", "nullish"],
      ["max_interactions", "int"],
      ["is_optional", "bool"],
      ["display_phase", "text"],
      ["feedback_gate", "text"],
      ["postanswer_gate", "text"],
      ["assistance_recording", "text"],
      ["status", "id"],
      ["approval_json", "nullish"],
      ["publication_status", "text"],
      ["routing_active", "bool"],
      ["payload_sha256", "text"],
    ],
    key: (doc) => ({
      teaching_id: textKey(doc, "teaching_id"),
      teaching_revision: numberKey(doc, "teaching_revision"),
    }),
  });

  await importSpecSheet(store, input.sheets, teaching, {
    sheet: "EVIDENCE_BINDINGS",
    collection: "evidence_bindings",
    spec: [
      ["binding_id", "id"],
      ["binding_revision", "int"],
      ["permanent_item_id", "id"],
      ["question_version", "id"],
      ["option_id", "id"],
      ["displayed_option", "text"],
      ["source_namespace", "text"],
      ["source_question_version", "text"],
      ["source_option_id", "text"],
      ["source_locator", "text"],
      ["option_proposition_match", "bool"],
      ["key_match", "bool"],
      ["status", "id"],
      ["inference_limit", "text"],
    ],
    key: (doc) => ({
      binding_id: textKey(doc, "binding_id"),
      binding_revision: numberKey(doc, "binding_revision"),
    }),
  });

  if (calibration) {
    const removed = await clearRoles(store, clearVersionIds, domains.runtime_binding);
    if (removed > 0) {
      workbookRole.warning = `Removed the earlier role from ${removed} question${
        removed === 1 ? "" : "s"
      }.`;
    }
    return result;
  }
  await importRoles(store, questions, bindRole, domains.runtime_binding);
  return result;
}

/** Calibration questions carry no runtime role. A removed row counts as passed, a missing one as unchanged. */
async function clearRoles(
  store: RelationshipStore,
  versionIds: string[],
  domain: DomainCounts,
): Promise<number> {
  if (versionIds.length === 0) {
    return 0;
  }
  const keys = versionIds.map((question_version_id) => ({ question_version_id }));
  const existing = await store.findMany("runtime_roles", keys);
  const held = new Set(existing.map((doc) => String(doc.question_version_id)));
  const removed =
    held.size === 0
      ? 0
      : await store.deleteMany(
          "runtime_roles",
          [...held].map((question_version_id) => ({ question_version_id })),
        );
  domain.passed += removed;
  domain.unchanged += versionIds.length - held.size;
  return removed;
}

async function importPhysiology(
  store: RelationshipStore,
  sheets: Map<string, SheetRow[]>,
  questions: SheetRow[],
  domain: DomainCounts,
): Promise<void> {
  await importSpecSheet(store, sheets, domain, {
    sheet: "MECHANISMS",
    collection: "mechanisms",
    spec: [
      ["mechanism_id", "id"],
      ["mechanism_revision", "int"],
      ["status", "id"],
      ["label", "text"],
      ["causal_model", "text"],
      ["condition_boundary", "text"],
      ["include_when", "text"],
      ["exclude_when", "text"],
      ["prerequisites_json", "text"],
      ["source_refs_json", "text"],
      ["approval_json", "nullish"],
    ],
    key: (doc) => ({
      mechanism_id: textKey(doc, "mechanism_id"),
      mechanism_revision: numberKey(doc, "mechanism_revision"),
    }),
  });

  const apQuestions = new Map<string, string>();
  for (const row of questions) {
    const permanentId = (row.permanent_item_id ?? "").trim();
    const version = (row.question_version ?? "").trim();
    if (permanentId && version) {
      apQuestions.set(permanentId, version);
    }
  }

  await importSpecSheet(store, sheets, domain, {
    sheet: "SUPPORT_LINKS",
    collection: "support_links",
    spec: [
      ["support_link_id", "id"],
      ["link_revision", "int"],
      ["status", "id"],
      ["relationship_type", "id"],
      ["clinical_permanent_item_id", "id"],
      ["clinical_question_version", "id"],
      ["clinical_content_sha256", "text"],
      ["clinical_fingerprint_contract", "text"],
      ["clinical_map_id", "id"],
      ["clinical_map_revision", "int"],
      ["clinical_map_binding_status", "text"],
      ["clinical_family_id", "id"],
      ["clinical_family_revision", "int"],
      ["clinical_primary_judgment_id", "id"],
      ["ap_permanent_item_id", "id"],
      ["ap_question_version", "id"],
      ["ap_content_sha256", "text"],
      ["mechanism_id", "id"],
      ["mechanism_revision", "int"],
      ["trigger_scope", "id"],
      ["trigger_option_id", "nullish"],
      ["trigger_event", "nullish"],
      ["clinical_distinction", "text"],
      ["ap_assessed_task", "text"],
      ["feedback_bridge", "text"],
      ["remaining_clinical_judgment", "text"],
      ["prerequisite_compatibility", "text"],
      ["track_scope_compatibility", "text"],
      ["topic_scope_compatibility", "text"],
      ["nonclone_justification", "text"],
      ["pair_leakage_review", "text"],
      ["exposure_dependency_json", "text"],
      ["approval_json", "nullish"],
      ["runtime_policy_id", "nullish"],
    ],
    key: (doc) => ({
      support_link_id: textKey(doc, "support_link_id"),
      link_revision: numberKey(doc, "link_revision"),
    }),
    check: (docs) => supportLinkCheck(store, docs, apQuestions),
  });

  await importApVariantGroups(store, sheets, apQuestions, domain);
}

async function supportLinkCheck(
  store: RelationshipStore,
  docs: Record<string, unknown>[],
  apQuestions: Map<string, string>,
): Promise<RowCheck> {
  const mechanismKey = (doc: Record<string, unknown>) => ({
    mechanism_id: textKey(doc, "mechanism_id"),
    mechanism_revision: numberKey(doc, "mechanism_revision"),
  });
  const mechanisms = await knownKeys(store, "mechanisms", docs.map(mechanismKey));
  return (doc) => {
    const status = textKey(doc, "status");
    if (!AP_SUPPORT_STATUSES.has(status)) {
      return `invalid status ${status}`;
    }
    if (doc.approval_json !== null) {
      return "approval_json must stay null";
    }
    const relationship = textKey(doc, "relationship_type");
    if (relationship !== "AP_MECHANISM_SUPPORT") {
      return `invalid relationship type ${relationship}`;
    }
    const trigger = textKey(doc, "trigger_scope");
    if (trigger !== "ITEM") {
      return `invalid trigger scope ${trigger}`;
    }
    const mechanism = mechanismKey(doc);
    if (!mechanisms(mechanism)) {
      return `missing mechanism ${mechanism.mechanism_id} revision ${mechanism.mechanism_revision}`;
    }
    const apId = textKey(doc, "ap_permanent_item_id");
    const apVersion = textKey(doc, "ap_question_version");
    const expected = apQuestions.get(apId);
    if (!expected) {
      return `missing AP question ${apId}`;
    }
    if (expected !== apVersion) {
      return `mismatched question version ${apVersion}`;
    }
    return null;
  };
}

function variantMembers(
  raw: string,
): { ids: string[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      error: "member_permanent_item_ids_json must be a nonempty array of AP permanent ids",
    };
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.some((id) => typeof id !== "string" || !id.trim())
  ) {
    return {
      error: "member_permanent_item_ids_json must be a nonempty array of AP permanent ids",
    };
  }
  return { ids: parsed.map((id) => id.trim()) };
}

async function importApVariantGroups(
  store: RelationshipStore,
  sheets: Map<string, SheetRow[]>,
  apQuestions: Map<string, string>,
  domain: DomainCounts,
): Promise<void> {
  const rows = sheetRowsByName(sheets, "AP_VARIANT_GROUPS");
  if (!rows) {
    return;
  }
  const parsed: {
    label: string;
    key: RelationshipKey;
    doc: Record<string, unknown>;
    members: string[];
    groupId: string;
  }[] = [];

  for (const [index, row] of rows.entries()) {
    const read = readSpec(row, [
      ["variant_group_id", "id"],
      ["variant_group_revision", "int"],
      ["status", "id"],
      ["member_permanent_item_ids_json", "text"],
      ["scope", "text"],
      ["approval_json", "nullish"],
    ]);
    const fallback = `AP_VARIANT_GROUPS row ${index + 1}`;
    if ("error" in read) {
      fail(domain, fallback, read.error);
      continue;
    }
    const status = textKey(read.doc, "status");
    if (!AP_VARIANT_STATUSES.has(status)) {
      fail(domain, fallback, `invalid status ${status}`);
      continue;
    }
    const members = variantMembers(
      textKey(read.doc, "member_permanent_item_ids_json"),
    );
    if ("error" in members) {
      fail(domain, fallback, members.error);
      continue;
    }
    const unknown = members.ids.find((id) => !apQuestions.has(id));
    if (unknown) {
      fail(domain, fallback, `unknown AP permanent id ${unknown}`);
      continue;
    }
    const groupId = textKey(read.doc, "variant_group_id");
    parsed.push({
      label: `AP_VARIANT_GROUPS ${groupId} ${numberKey(read.doc, "variant_group_revision")}`,
      key: {
        variant_group_id: groupId,
        variant_group_revision: numberKey(read.doc, "variant_group_revision"),
      },
      doc: read.doc,
      members: members.ids,
      groupId,
    });
  }

  const owners = new Map<string, Set<string>>();
  for (const row of parsed) {
    for (const member of row.members) {
      const groups = owners.get(member) ?? new Set<string>();
      groups.add(row.groupId);
      owners.set(member, groups);
    }
  }
  const conflictingGroups = new Set<string>();
  for (const row of parsed) {
    const uniqueMembers = new Set(row.members);
    if (uniqueMembers.size !== row.members.length) {
      conflictingGroups.add(row.groupId);
    }
  }
  for (const groups of owners.values()) {
    if (groups.size > 1) {
      for (const groupId of groups) {
        conflictingGroups.add(groupId);
      }
    }
  }

  const ready: ReadyRow[] = [];
  for (const row of parsed) {
    if (conflictingGroups.has(row.groupId)) {
      fail(domain, row.label, "conflicting variant membership");
      continue;
    }
    ready.push({ label: row.label, key: row.key, doc: row.doc });
  }
  await commitRows(store, "ap_variant_groups", ready, domain);
}

function judgmentKey(doc: Record<string, unknown>): RelationshipKey {
  return { judgment_id: textKey(doc, "primary_judgment_id") };
}

function variantGroupKey(doc: Record<string, unknown>): RelationshipKey | null {
  const variantGroupId = doc.variant_group_id;
  return typeof variantGroupId === "string" && variantGroupId
    ? { variant_group_id: variantGroupId }
    : null;
}

async function mapReferenceCheck(
  store: RelationshipStore,
  docs: Record<string, unknown>[],
): Promise<RowCheck> {
  const familyKey = (doc: Record<string, unknown>) => ({
    family_id: textKey(doc, "family_id"),
    family_revision: numberKey(doc, "family_revision"),
  });
  const contextKey = (doc: Record<string, unknown>) => ({
    context_id: textKey(doc, "context_id"),
    context_revision: numberKey(doc, "context_revision"),
  });
  const [families, judgments, contexts, variantGroups] = await Promise.all([
    knownKeys(store, "families", docs.map(familyKey)),
    knownKeys(store, "judgments", docs.map(judgmentKey)),
    knownKeys(store, "contexts", docs.map(contextKey)),
    knownKeys(
      store,
      "variant_groups",
      docs.flatMap((doc) => {
        const key = variantGroupKey(doc);
        return key ? [key] : [];
      }),
    ),
  ]);
  return (doc) => {
    const family = familyKey(doc);
    if (!families(family)) {
      return `missing family ${family.family_id} revision ${family.family_revision}`;
    }
    if (!judgments(judgmentKey(doc))) {
      return `missing judgment ${textKey(doc, "primary_judgment_id")}`;
    }
    const context = contextKey(doc);
    if (!contexts(context)) {
      return `missing context ${context.context_id} revision ${context.context_revision}`;
    }
    const variantGroup = variantGroupKey(doc);
    if (variantGroup && !variantGroups(variantGroup)) {
      return `missing variant group ${variantGroup.variant_group_id}`;
    }
    return null;
  };
}

async function importTopicRegistry(
  store: RelationshipStore,
  sheets: Map<string, SheetRow[]>,
  domain: DomainCounts,
): Promise<void> {
  const rows = sheetRowsByName(sheets, "TOPIC_REGISTRY");
  if (!rows) {
    return;
  }
  const ready: ReadyRow[] = [];
  for (const [index, row] of rows.entries()) {
    const reader = new RowReader(row);
    const topic_key = reader.id("topic_key");
    const learner_topic_name = reader.id("learner_topic_name");
    const source_systems_json = reader.text("source_systems_json");
    const topic_mapping_revision = reader.int("topic_mapping_revision");
    const resolution = reader.nullish("resolution");
    const mismatch = topicKeyMismatch(topic_key, learner_topic_name);
    if (mismatch) {
      reader.errors.push(mismatch);
    }
    const fallback = `TOPIC_REGISTRY row ${index + 1}`;
    if (reader.errors.length > 0) {
      fail(domain, fallback, reader.errors.join("; "));
      continue;
    }
    const topic = learnerTopicForName(learner_topic_name);
    ready.push({
      label: `TOPIC_REGISTRY ${topic_key} ${topic_mapping_revision}`,
      key: { topic_key, topic_mapping_revision },
      doc: {
        topic_key,
        learner_topic_name,
        source_systems_json,
        topic_mapping_revision,
        database_topic_id: topic?.topic_id ?? null,
        resolution,
      },
    });
  }
  await commitRows(store, "topic_registry", ready, domain);
}

async function importTopicBindings(
  store: RelationshipStore,
  sheets: Map<string, SheetRow[]>,
  domain: DomainCounts,
): Promise<void> {
  const rows = sheetRowsByName(sheets, "TOPIC_BINDINGS");
  if (!rows) {
    return;
  }
  const ready: ReadyRow[] = [];
  for (const [index, row] of rows.entries()) {
    const reader = new RowReader(row);
    const permanent_item_id = reader.id("permanent_item_id");
    const question_version = reader.id("question_version");
    const source_system = reader.text("source_system");
    const source_topic = reader.text("source_topic");
    const topic_key = reader.id("topic_key");
    const learner_topic_name = reader.id("learner_topic_name");
    const topic_mapping_revision = reader.int("topic_mapping_revision");
    const topic_id = reader.nullish("topic_id");
    const status = reader.nullish("status");
    const mismatch = topicKeyMismatch(topic_key, learner_topic_name);
    if (mismatch) {
      reader.errors.push(mismatch);
    }
    const fallback = `TOPIC_BINDINGS row ${index + 1}`;
    if (reader.errors.length > 0) {
      fail(domain, fallback, reader.errors.join("; "));
      continue;
    }
    ready.push({
      label: `TOPIC_BINDINGS ${question_version} ${topic_mapping_revision}`,
      key: { question_version, topic_mapping_revision },
      doc: {
        permanent_item_id,
        question_version,
        source_system,
        source_topic,
        topic_key,
        learner_topic_name,
        topic_mapping_revision,
        topic_id,
        status,
      },
    });
  }
  await commitRows(store, "topic_bindings", ready, domain);
}

async function importRoles(
  store: RelationshipStore,
  questions: SheetRow[],
  role: RuntimeRoleName | null,
  domain: DomainCounts,
): Promise<void> {
  if (!role) {
    return;
  }
  const ready: ReadyRow[] = [];
  for (const [index, row] of questions.entries()) {
    const question_version_id = (row.question_version ?? "").trim();
    if (!question_version_id) {
      fail(
        domain,
        `QUESTIONS row ${index + 1}`,
        "question_version is required",
      );
      continue;
    }
    ready.push({
      label: `runtime_roles ${question_version_id}`,
      key: { question_version_id },
      doc: { question_version_id, role },
    });
  }
  await commitRows(store, "runtime_roles", ready, domain);
}
