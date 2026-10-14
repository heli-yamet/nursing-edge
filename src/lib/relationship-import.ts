import {
  learnerTopicForName,
  topicKeyMismatch,
} from "@/lib/learner-topics";
import type { RelationshipKey, RelationshipStore } from "@/lib/relationship-store";
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

const SIBLING_WORKBOOK = "Nursing_Edge_Sibling500_Production_R7.xlsx";
const AP_WORKBOOK = "Nursing_Edge_AP450_Production_R7.xlsx";
const CLINICAL_CORE_WORKBOOKS = new Set([
  "Nursing_Edge_Selected_0001_1000_Production_R7.xlsx",
  "Nursing_Edge_Selected_1001_1500_Production_R7.xlsx",
  "Nursing_Edge_Selected_1501_2000_Production_R7.xlsx",
  "Nursing_Edge_Coverage_Supplement_4_Production_R7.xlsx",
]);

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

type ReadyRow = {
  label: string;
  key: RelationshipKey;
  doc: Record<string, unknown>;
};

type FieldKind = "id" | "text" | "int" | "bool" | "nullish";

export function emptyDomainCounts(): DomainCounts {
  return { passed: 0, failed: 0, unchanged: 0, failures: [] };
}

function sourceBaseName(source: string): string {
  const trimmed = source.trim().replace(/\\/g, "/");
  const base = trimmed.split("/").pop() ?? "";
  return base || "workbook.xlsx";
}

export function runtimeRoleForSource(source: string): RuntimeRoleName | null {
  const name = sourceBaseName(source);
  if (name === SIBLING_WORKBOOK) {
    return "CLINICAL_SIBLING_RESERVED";
  }
  if (name === AP_WORKBOOK) {
    return "AP_REINFORCEMENT";
  }
  if (CLINICAL_CORE_WORKBOOKS.has(name)) {
    return "CLINICAL_CORE";
  }
  return null;
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
  const groups = new Map<string, ReadyRow[]>();
  for (const row of rows) {
    const id = stableJson(row.key);
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }

  for (const group of groups.values()) {
    const first = group[0];
    if (!first) {
      continue;
    }
    const stored = await store.find(collection, first.key);
    const storedJson = stored ? stableJson(stored) : null;
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

    await store.insert(collection, first.doc);
    domain.passed += 1;
    domain.unchanged += group.length - 1;
  }
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
    check?: (
      doc: Record<string, unknown>,
    ) => Promise<string | null>;
  },
): Promise<void> {
  const rows = sheetRowsByName(sheets, input.sheet);
  if (!rows) {
    return;
  }
  const ready: ReadyRow[] = [];
  for (const [index, row] of rows.entries()) {
    const parsed = readSpec(row, input.spec);
    const fallback = `${input.sheet} row ${index + 1}`;
    if ("error" in parsed) {
      fail(domain, fallback, parsed.error);
      continue;
    }
    const refError = input.check ? await input.check(parsed.doc) : null;
    if (refError) {
      fail(domain, fallback, refError);
      continue;
    }
    const key = input.key(parsed.doc);
    ready.push({
      label: `${input.sheet} ${Object.values(key).join(" ")}`,
      key,
      doc: parsed.doc,
    });
  }
  await commitRows(store, input.collection, ready, domain);
}

async function exists(
  store: RelationshipStore,
  collection: string,
  key: RelationshipKey,
): Promise<boolean> {
  return (await store.find(collection, key)) !== null;
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
}): Promise<RelationshipDomains> {
  const domains: RelationshipDomains = {
    mapping_and_exposure: emptyDomainCounts(),
    evidence_and_teaching: emptyDomainCounts(),
    runtime_binding: emptyDomainCounts(),
  };
  const role = runtimeRoleForSource(input.source);
  const questions = sheetRowsByName(input.sheets, "QUESTIONS") ?? [];
  const needsStore =
    (questions.length > 0 && role !== null) ||
    MAPPING_SHEETS.some(
      (name) => (sheetRowsByName(input.sheets, name)?.length ?? 0) > 0,
    ) ||
    TEACHING_SHEETS.some(
      (name) => (sheetRowsByName(input.sheets, name)?.length ?? 0) > 0,
    );
  if (!needsStore) {
    return domains;
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
    check: async (doc) =>
      (await exists(store, "cj_classes", { class_id: textKey(doc, "class_id") }))
        ? null
        : `missing cj class ${textKey(doc, "class_id")}`,
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
    check: async (doc) =>
      (await exists(store, "judgments", {
        judgment_id: textKey(doc, "primary_judgment_id"),
      }))
        ? null
        : `missing judgment ${textKey(doc, "primary_judgment_id")}`,
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
    check: (doc) => mapReferenceError(store, doc),
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
    check: async (doc) =>
      (await exists(store, "transfer_links", {
        link_id: textKey(doc, "link_id"),
        link_revision: numberKey(doc, "link_revision"),
      }))
        ? null
        : `missing transfer link ${textKey(doc, "link_id")}`,
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

  if (sourceBaseName(input.source) === SIBLING_WORKBOOK) {
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

  await importRoles(store, questions, role, domains.runtime_binding);
  return domains;
}

async function mapReferenceError(
  store: RelationshipStore,
  doc: Record<string, unknown>,
): Promise<string | null> {
  const familyId = textKey(doc, "family_id");
  const familyRevision = numberKey(doc, "family_revision");
  if (
    !(await exists(store, "families", {
      family_id: familyId,
      family_revision: familyRevision,
    }))
  ) {
    return `missing family ${familyId} revision ${familyRevision}`;
  }
  const judgmentId = textKey(doc, "primary_judgment_id");
  if (!(await exists(store, "judgments", { judgment_id: judgmentId }))) {
    return `missing judgment ${judgmentId}`;
  }
  const contextId = textKey(doc, "context_id");
  const contextRevision = numberKey(doc, "context_revision");
  if (
    !(await exists(store, "contexts", {
      context_id: contextId,
      context_revision: contextRevision,
    }))
  ) {
    return `missing context ${contextId} revision ${contextRevision}`;
  }
  const variantGroupId = doc.variant_group_id;
  if (typeof variantGroupId === "string" && variantGroupId) {
    if (
      !(await exists(store, "variant_groups", {
        variant_group_id: variantGroupId,
      }))
    ) {
      return `missing variant group ${variantGroupId}`;
    }
  }
  return null;
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
