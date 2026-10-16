type IndexKeys = Record<string, 1>;

export type RelationshipIndex = {
  collection: string;
  keys: IndexKeys;
  unique: boolean;
};

export type RelationshipIndexDb = {
  collection(name: string): {
    createIndex(keys: IndexKeys, options?: { unique?: boolean }): Promise<string>;
  };
};

function unique(collection: string, keys: IndexKeys): RelationshipIndex {
  return { collection, keys, unique: true };
}

function lookup(collection: string, keys: IndexKeys): RelationshipIndex {
  return { collection, keys, unique: false };
}

/**
 * Identity is the workbook id plus revision. Rows that name a question point at
 * question_version (runtime roles use question_version_id). review_matrix is omitted.
 */
export const relationshipIndexes: RelationshipIndex[] = [
  unique("cj_classes", { class_id: 1 }),
  unique("judgments", { judgment_id: 1 }),
  unique("families", { family_id: 1, family_revision: 1 }),
  unique("contexts", { context_id: 1, context_revision: 1 }),
  unique("variant_groups", { variant_group_id: 1, variant_group_revision: 1 }),
  unique("topic_registry", { topic_key: 1, topic_mapping_revision: 1 }),
  unique("topic_bindings", { question_version: 1, topic_mapping_revision: 1 }),
  unique("maps", { map_id: 1, map_revision: 1 }),
  lookup("maps", { question_version: 1 }),
  unique("transfer_links", { link_id: 1, link_revision: 1 }),
  unique("link_eligibility", { evaluation_id: 1, evaluation_revision: 1 }),
  lookup("link_eligibility", { anchor_question_version: 1 }),
  lookup("link_eligibility", { candidate_question_version: 1 }),
  unique("exposure_dependencies", { dependency_id: 1, dependency_revision: 1 }),
  lookup("exposure_dependencies", { target_question_version: 1 }),
  lookup("exposure_dependencies", { related_question_version: 1 }),
  unique("dependency_retirements", {
    retirement_id: 1,
    retirement_revision: 1,
  }),
  lookup("dependency_retirements", { old_target_question_version: 1 }),
  lookup("dependency_retirements", { replacement_target_question_version: 1 }),
  unique("precommit_teaching", { teaching_id: 1, teaching_revision: 1 }),
  lookup("precommit_teaching", { question_version: 1 }),
  unique("evidence_bindings", { binding_id: 1, binding_revision: 1 }),
  lookup("evidence_bindings", { question_version: 1 }),
  unique("mechanisms", { mechanism_id: 1, mechanism_revision: 1 }),
  unique("support_links", { support_link_id: 1, link_revision: 1 }),
  unique("link_decisions", {
    link_kind: 1,
    link_id: 1,
    link_revision: 1,
  }),
  lookup("support_links", { clinical_question_version: 1 }),
  lookup("support_links", { ap_question_version: 1 }),
  unique("ap_variant_groups", {
    variant_group_id: 1,
    variant_group_revision: 1,
  }),
  unique("runtime_roles", { question_version_id: 1 }),
];

export async function ensureRelationshipIndexes(
  db: RelationshipIndexDb,
): Promise<void> {
  for (const index of relationshipIndexes) {
    await db.collection(index.collection).createIndex(
      index.keys,
      index.unique ? { unique: true } : undefined,
    );
  }
}
