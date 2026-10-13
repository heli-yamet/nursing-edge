/** Workbook relationship rows. Revisions are integers. Approval stays null until a later decision. */

export type CjClass = {
  class_id: string;
  label: string;
  core_question: string;
};

export type Judgment = {
  judgment_id: string;
  class_id: string;
  label: string;
  definition: string;
};

export type Family = {
  family_id: string;
  family_revision: number;
  status: string;
  label: string;
  primary_judgment_id: string;
  response_target: string;
  decision_rule: string;
  evidence_pivot: string;
  inclusion_boundary: string;
  exclusion_boundary: string;
  counterfactual_boundary: string;
  approval: string | null;
  provenance: string | null;
};

export type ClinicalContext = {
  context_id: string;
  context_revision: number;
  status: string;
  label: string;
  clinical_situation: string;
  scope_notes: string | null;
  approval: string | null;
};

export type VariantGroup = {
  variant_group_id: string;
  variant_group_revision: number;
  status: string;
  member_map_ids_json: string;
  member_permanent_item_ids_json: string;
  purpose: string;
  completeness: string;
  approval_json: string | null;
};

export type TopicRegistryEntry = {
  topic_key: string;
  learner_topic_name: string;
  source_systems_json: string;
  topic_mapping_revision: number;
  database_topic_id: string | null;
  resolution: string | null;
};

export type TopicBinding = {
  permanent_item_id: string;
  question_version: string;
  source_system: string;
  source_topic: string;
  topic_key: string;
  learner_topic_name: string;
  topic_mapping_revision: number;
  /** Workbook placeholder. Not a database topic id. */
  topic_id: string | null;
  status: string | null;
};

export type ClinicalMap = {
  map_id: string;
  map_revision: number;
  status: string;
  question_version: string;
  permanent_item_id: string;
  source_content_sha256: string;
  family_id: string;
  family_revision: number;
  primary_judgment_id: string;
  secondary_judgment_ids: string;
  track: string;
  format: string;
  assessment_basis: string;
  context_id: string;
  context_revision: number;
  variant_group_id: string | null;
  time_structure: string;
  knowledge_dependencies: string;
  decision_target: string;
  comparison_boundary: string;
  keyed_closure: string;
  evidence: string;
  approval: string | null;
};

export type TransferLink = {
  link_id: string;
  link_revision: number;
  status: string;
  anchor_map_id: string;
  anchor_map_revision: number;
  candidate_map_id: string;
  candidate_map_revision: number;
  same_assessed_boundary: boolean;
  context_difference: string;
  dependency_comparison: string;
  nonclone_justification: string;
  cue_leakage_review: string;
  scope_compatibility: string;
  approval: string | null;
};

export type LinkEligibility = {
  evaluation_id: string;
  evaluation_revision: number;
  link_id: string;
  link_revision: number;
  anchor_permanent_item_id: string;
  anchor_question_version: string;
  candidate_permanent_item_id: string;
  candidate_question_version: string;
  anchor_topic_key: string;
  candidate_topic_key: string;
  static_disposition: string;
  failed_gates: string;
  owner_overlap_dependencies: string;
  exposure_dependencies: string;
  approval_status: string;
  publication_status: string;
  learner_exposure_tested: boolean;
  /** Audit copy. False is the off state and is not a routing index. */
  runtime_eligible: boolean;
  fallback: string;
};

export type ExposureDependency = {
  dependency_id: string;
  dependency_revision: number;
  target_permanent_item_id: string;
  target_question_version: string;
  target_content_sha256: string;
  related_permanent_item_id: string;
  related_question_version: string;
  related_content_sha256: string;
  related_variant_group_id: string | null;
  relation_type: string;
  exposure_scope: string;
  source_kind: string;
  source_locator: string;
  reason: string;
  status: string;
  approval_json: string | null;
  routing_active: boolean;
  payload_sha256: string;
};

export type DependencyRetirement = {
  retirement_id: string;
  retirement_revision: number;
  dependency_id: string;
  dependency_revision: number;
  old_target_question_version: string;
  replacement_target_question_version: string;
  status: string;
  reason: string;
  prior_record_json: string;
  preserve_old_target_restriction: boolean;
  preserve_own_all_version_exposure: boolean;
  approval_json: string | null;
  routing_active: boolean;
};

export type PrecommitTeaching = {
  teaching_id: string;
  teaching_revision: number;
  permanent_item_id: string;
  question_version: string;
  source_content_sha256: string;
  source_review_record: string;
  question_role: string;
  primary_prompt: string;
  learner_commitment_prompt: string;
  precommit_feedback: string;
  feedback_template_id: string;
  feedback_mode: string;
  optional_second_prompt: string | null;
  max_interactions: number;
  is_optional: boolean;
  display_phase: string;
  feedback_gate: string;
  postanswer_gate: string;
  assistance_recording: string;
  status: string;
  approval_json: string | null;
  publication_status: string;
  routing_active: boolean;
  payload_sha256: string;
};

export type EvidenceBinding = {
  binding_id: string;
  binding_revision: number;
  permanent_item_id: string;
  question_version: string;
  option_id: string;
  displayed_option: string;
  source_namespace: string;
  source_question_version: string;
  source_option_id: string;
  source_locator: string;
  option_proposition_match: boolean;
  key_match: boolean;
  status: string;
  inference_limit: string;
};

export type Mechanism = {
  mechanism_id: string;
  mechanism_revision: number;
  status: string;
  label: string;
  causal_model: string;
  condition_boundary: string;
  include_when: string;
  exclude_when: string;
  prerequisites_json: string;
  source_refs_json: string;
  approval_json: string | null;
};

export type SupportLink = {
  support_link_id: string;
  link_revision: number;
  status: string;
  relationship_type: string;
  clinical_permanent_item_id: string;
  clinical_question_version: string;
  clinical_content_sha256: string;
  clinical_fingerprint_contract: string;
  clinical_map_id: string | null;
  clinical_map_revision: number | null;
  clinical_map_binding_status: string;
  clinical_family_id: string | null;
  clinical_family_revision: number | null;
  clinical_primary_judgment_id: string | null;
  ap_permanent_item_id: string;
  ap_question_version: string;
  ap_content_sha256: string;
  mechanism_id: string;
  mechanism_revision: number;
  trigger_scope: string;
  trigger_option_id: string | null;
  trigger_event: string | null;
  clinical_distinction: string;
  ap_assessed_task: string;
  feedback_bridge: string;
  remaining_clinical_judgment: string;
  prerequisite_compatibility: string;
  track_scope_compatibility: string;
  topic_scope_compatibility: string;
  nonclone_justification: string;
  pair_leakage_review: string;
  exposure_dependency_json: string;
  approval_json: string | null;
  runtime_policy_id: string | null;
};

export type ApVariantGroup = {
  variant_group_id: string;
  variant_group_revision: number;
  status: string;
  member_permanent_item_ids_json: string;
  scope: string;
  approval_json: string | null;
};

export const RUNTIME_ROLE_NAMES = [
  "CLINICAL_CORE",
  "CLINICAL_SIBLING_RESERVED",
  "AP_REINFORCEMENT",
] as const;

export type RuntimeRoleName = (typeof RUNTIME_ROLE_NAMES)[number];

/** One row per question version. Publication does not set this row. */
export type RuntimeRole = {
  question_version_id: string;
  role: RuntimeRoleName;
};
