import type { Confidence } from "@/lib/learner-types";

export const CHANGE_CLASSES = [
  "ACCURACY_IMPROVED",
  "ACCURACY_DECLINED",
  "CORRECT_CONFIDENCE_STRENGTHENED",
  "CORRECT_CONFIDENCE_STABLE",
  "CORRECT_CONFIDENCE_WEAKENED",
  "ERROR_CALIBRATION_IMPROVED",
  "ERROR_CALIBRATION_STABLE",
  "ERROR_CALIBRATION_WORSENED",
] as const;

export type ChangeClass = (typeof CHANGE_CLASSES)[number];

export const CHANGE_CLASS_LABELS: Record<ChangeClass, string> = {
  ACCURACY_IMPROVED: "Accuracy Improved",
  ACCURACY_DECLINED: "Accuracy Declined",
  CORRECT_CONFIDENCE_STRENGTHENED: "Correct Confidence Strengthened",
  CORRECT_CONFIDENCE_STABLE: "Correct Confidence Stable",
  CORRECT_CONFIDENCE_WEAKENED: "Correct Confidence Weakened",
  ERROR_CALIBRATION_IMPROVED: "Error Calibration Improved",
  ERROR_CALIBRATION_STABLE: "Error Calibration Stable",
  ERROR_CALIBRATION_WORSENED: "Error Calibration Worsened",
};

export type ChangeEvidence =
  | { status: "CLASSIFIED"; change_class: ChangeClass }
  | { status: "INSUFFICIENT_EVIDENCE" };

export type EvidenceRole = "CLINICAL" | "PHYSIOLOGY";

export type AttemptValidity =
  | "VALID"
  | "FAILED"
  | "DUPLICATE"
  | "REJECTED"
  | "INVALIDATED";

export type EvidenceAttempt = {
  attempt_id: string;
  learner_id: string;
  question_id: string;
  question_version_id: string;
  correct: boolean;
  confidence: Confidence;
  /** Per-learner, per-question commit order. */
  sequence: number;
  role: EvidenceRole;
  validity: AttemptValidity;
};

/** One `CONTENT_LINEAGE` row. */
export type ContentLineageRecord = {
  permanent_item_id: string;
  prior_question_version: string;
  question_version: string;
  change_kind: string;
};

/**
 * Change kinds the release contract records as nonmaterial. Any other kind,
 * or a version pair with no lineage row, is a Material boundary.
 */
export const NONMATERIAL_CHANGE_KINDS: ReadonlySet<string> = new Set([
  "TEACHING_CLARITY_SUCCESSOR",
]);

/** Ordinal for direction only. Never a score. */
const CONFIDENCE_ORDER: readonly Confidence[] = ["UNSURE", "SURE", "CONFIDENT"];

const INSUFFICIENT: ChangeEvidence = { status: "INSUFFICIENT_EVIDENCE" };

export type ContinuityIndex = {
  readonly componentOf: ReadonlyMap<string, string>;
};

function identityKey(questionId: string, questionVersionId: string): string {
  return `${questionId}\u0000${questionVersionId}`;
}

export function buildContinuityIndex(
  records: readonly ContentLineageRecord[],
): ContinuityIndex {
  const parent = new Map<string, string>();

  const find = (key: string): string => {
    let root = key;
    while (parent.has(root) && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    let node = key;
    while (node !== root) {
      const next = parent.get(node)!;
      parent.set(node, root);
      node = next;
    }
    return root;
  };

  for (const record of records) {
    if (!NONMATERIAL_CHANGE_KINDS.has(record.change_kind)) {
      continue;
    }
    const prior = identityKey(
      record.permanent_item_id,
      record.prior_question_version,
    );
    const successor = identityKey(
      record.permanent_item_id,
      record.question_version,
    );
    if (!parent.has(prior)) parent.set(prior, prior);
    if (!parent.has(successor)) parent.set(successor, successor);
    const priorRoot = find(prior);
    const successorRoot = find(successor);
    if (priorRoot !== successorRoot) {
      parent.set(successorRoot, priorRoot);
    }
  }

  const componentOf = new Map<string, string>();
  for (const key of parent.keys()) {
    componentOf.set(key, find(key));
  }
  return { componentOf };
}

export const EMPTY_CONTINUITY: ContinuityIndex = { componentOf: new Map() };

type ComparableIdentity = Pick<
  EvidenceAttempt,
  "learner_id" | "question_id" | "question_version_id" | "role"
>;

/**
 * The one comparison-compatibility determination. Compatible means the same
 * learner and the same clinical identity: the same `question_version`, or
 * versions joined by recorded nonmaterial lineage. A sibling is a different
 * identity. Physiology is never compared.
 */
export function comparisonCompatible(
  left: ComparableIdentity,
  right: ComparableIdentity,
  continuity: ContinuityIndex,
): boolean {
  if (left.role !== "CLINICAL" || right.role !== "CLINICAL") {
    return false;
  }
  if (left.learner_id !== right.learner_id) {
    return false;
  }
  if (left.question_id !== right.question_id) {
    return false;
  }
  if (left.question_version_id === right.question_version_id) {
    return true;
  }
  const leftComponent = continuity.componentOf.get(
    identityKey(left.question_id, left.question_version_id),
  );
  const rightComponent = continuity.componentOf.get(
    identityKey(right.question_id, right.question_version_id),
  );
  return leftComponent !== undefined && leftComponent === rightComponent;
}

export function isValidEvidence(attempt: EvidenceAttempt): boolean {
  return attempt.validity === "VALID";
}

function confidenceDirection(
  previous: Confidence,
  current: Confidence,
): "RISE" | "UNCHANGED" | "FALL" {
  const before = CONFIDENCE_ORDER.indexOf(previous);
  const after = CONFIDENCE_ORDER.indexOf(current);
  if (before < 0 || after < 0) {
    throw new Error("unknown confidence level");
  }
  if (after > before) return "RISE";
  if (after < before) return "FALL";
  return "UNCHANGED";
}

/** Correctness first, then confidence direction. Exactly one of eight. */
export function changeClassOf(
  previous: Pick<EvidenceAttempt, "correct" | "confidence">,
  current: Pick<EvidenceAttempt, "correct" | "confidence">,
): ChangeClass {
  if (!previous.correct && current.correct) return "ACCURACY_IMPROVED";
  if (previous.correct && !current.correct) return "ACCURACY_DECLINED";

  const direction = confidenceDirection(previous.confidence, current.confidence);
  if (current.correct) {
    if (direction === "RISE") return "CORRECT_CONFIDENCE_STRENGTHENED";
    if (direction === "FALL") return "CORRECT_CONFIDENCE_WEAKENED";
    return "CORRECT_CONFIDENCE_STABLE";
  }
  if (direction === "FALL") return "ERROR_CALIBRATION_IMPROVED";
  if (direction === "RISE") return "ERROR_CALIBRATION_WORSENED";
  return "ERROR_CALIBRATION_STABLE";
}

/**
 * Classifies change from `previous` to `current`. Anything short of two
 * distinct, valid, comparison-compatible clinical attempts is insufficient
 * evidence, never Stable.
 */
export function classifyChange(
  previous: EvidenceAttempt | null | undefined,
  current: EvidenceAttempt | null | undefined,
  continuity: ContinuityIndex,
): ChangeEvidence {
  if (!previous || !current) return INSUFFICIENT;
  if (previous.attempt_id === current.attempt_id) return INSUFFICIENT;
  if (!isValidEvidence(previous) || !isValidEvidence(current)) {
    return INSUFFICIENT;
  }
  if (!comparisonCompatible(previous, current, continuity)) {
    return INSUFFICIENT;
  }
  if (previous.sequence >= current.sequence) {
    throw new Error("previous attempt must come before the current attempt");
  }
  return { status: "CLASSIFIED", change_class: changeClassOf(previous, current) };
}

/**
 * Valid attempts comparison-compatible with `anchor`, oldest first. Includes
 * the anchor when it is valid.
 */
export function compatibleSequence(
  attempts: readonly EvidenceAttempt[],
  anchor: ComparableIdentity,
  continuity: ContinuityIndex,
): EvidenceAttempt[] {
  const seen = new Set<string>();
  return attempts
    .filter((attempt) => {
      if (seen.has(attempt.attempt_id)) return false;
      seen.add(attempt.attempt_id);
      return (
        isValidEvidence(attempt) &&
        comparisonCompatible(anchor, attempt, continuity)
      );
    })
    .sort(
      (left, right) =>
        left.sequence - right.sequence ||
        (left.attempt_id < right.attempt_id
          ? -1
          : left.attempt_id > right.attempt_id
            ? 1
            : 0),
    );
}
