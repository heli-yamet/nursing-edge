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
  text: string;
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
};

export type QuestionVersion = {
  question_version_id: string;
  question_id: string;
  format: QuestionFormat;
  stem: string;
  options: AnswerOption[];
  correct_option_ids: string[];
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
