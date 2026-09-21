export const CURRENT_RULE_SET_VERSION = "5.1";

export type Confidence = "UNSURE" | "SURE" | "CONFIDENT";

export type SixState =
  | "CORRECT_UNSURE"
  | "CORRECT_SURE"
  | "CORRECT_CONFIDENT"
  | "INCORRECT_UNSURE"
  | "INCORRECT_SURE"
  | "INCORRECT_CONFIDENT";

export type EntitlementSource = "SHOPIFY" | "MANUAL_GRANT";
export type EntitlementStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export type QuestionStatus = "ACTIVE" | "PAUSED" | "RETIRED";
export type QuestionFormat = "MCQ" | "SATA";
export type PublicationStatus = "STAGED" | "PUBLISHED";
export type SourceTrack = "CCRN" | "NCLEX";
export type ImportLineOutcome = "PASSED" | "FAILED" | "UNCHANGED";

export type SessionType = "PRACTICE" | "REVIEW" | "CALIBRATION";
export type SessionState = "ACTIVE" | "COMPLETED" | "ENDED";

export type ReviewStage = "REPAIR" | "CONFIRMATION";
export type ReviewCycleState =
  | "ACTIVE"
  | "COMPLETE"
  | "EXPIRED"
  | "PAUSED"
  | "CLOSED";

export type AnswerOption = {
  option_id: string;
  displayed_option: string;
  option_text: string;
  is_correct: boolean;
  authored_role: string;
  patient_specific_option_analysis: string;
};

export type QuestionRationales = {
  clinical_key_justification: string;
  learner_core_rationale: string;
  focused_clinical_contrast: string;
  transfer_rule: string;
  next_reassessment_application: string;
  clinical_source_anchors: string;
};

export type ReviewTeaching = {
  reasoning_target: string;
  primary_interview_prompt: string;
  expected_reasoning_commitment: string;
  concise_teaching_response: string;
  optional_second_prompt: string;
  the_trap: string;
  why_it_wins: string;
  carry_it_forward: string;
  reasoning_diagnostic_tag: string;
  reasoning_map_question_version_record: string;
};

export type AssignedVersion = {
  position: number;
  question_id: string;
  question_version_id: string;
};

export type Learner = {
  learner_id: string;
  email: string;
  password_hash: string;
  first_name: string;
  email_verified: boolean;
  terms_accepted_at: Date | null;
  orientation_completed_at: Date | null;
  created_at: Date;
};

export type Entitlement = {
  entitlement_id: string;
  learner_id: string;
  source: EntitlementSource;
  status: EntitlementStatus;
  shopify_customer_id: string | null;
  paid_through_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

export type Question = {
  question_id: string;
  topic_id: string;
  status: QuestionStatus;
  source_system: string;
  source_topic: string;
  track: SourceTrack;
  selected_number: number;
  original_source_q: string;
  workbook_row: string;
};

export type QuestionVersion = {
  question_version_id: string;
  question_id: string;
  format: QuestionFormat;
  stem: string;
  options: AnswerOption[];
  correct_option_ids: string[];
  displayed_correct_answer: string;
  commit_prompt: string;
  source_rating: string;
  rationales: QuestionRationales;
  review_teaching: ReviewTeaching;
  learner_core_rationale: string;
  content_fingerprint: string;
  publication_status: PublicationStatus;
  active: boolean;
  valid: boolean;
  complete: boolean;
};

export type Session = {
  session_id: string;
  learner_id: string;
  type: SessionType;
  scope: string;
  size: 10 | 25 | 50 | 35;
  state: SessionState;
  assigned_versions: AssignedVersion[];
  created_at: Date;
};

export type Attempt = {
  attempt_id: string;
  learner_id: string;
  session_id: string;
  question_version_id: string;
  selected_option_ids: string[];
  confidence: Confidence;
  correct: boolean;
  six_state: SixState;
  sequence: number;
  committed_at: Date;
  rule_set_version: string;
};

export type Exposure = {
  exposure_id: string;
  learner_id: string;
  question_version_id: string;
  session_id: string;
  first_seen_at: Date;
};

export type ReviewCycle = {
  cycle_id: string;
  learner_id: string;
  question_id: string;
  stage: ReviewStage;
  state: ReviewCycleState;
  due_at: Date;
  active_window_expires_at: Date;
  paused_duration_ms: number;
  triggering_attempt_id: string;
  triggering_six_state: SixState;
  closure_reason: string | null;
  rule_set_version: string;
};

export type ReviewTransition = {
  transition_id: string;
  cycle_id: string;
  attempt_id: string;
  from_stage: ReviewStage | null;
  to_stage: ReviewStage | null;
  occurred_at: Date;
  reason: string;
};

export type ImportBatch = {
  batch_id: string;
  created_at: Date;
  source: string;
  line_count: number;
  passed_count: number;
  failed_count: number;
  unchanged_count: number;
};

export type ImportLine = {
  line_id: string;
  batch_id: string;
  question_id: string;
  question_version_id: string;
  workbook_row: string;
  outcome: ImportLineOutcome;
  errors: string[];
};
