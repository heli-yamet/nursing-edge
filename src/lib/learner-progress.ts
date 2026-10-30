import {
  CHANGE_CLASS_LABELS,
  CHANGE_CLASSES,
  classifyChange,
  type ChangeClass,
  type ContinuityIndex,
  type EvidenceAttempt,
  isValidEvidence,
} from "@/lib/change-evidence";
import {
  LEARNER_TOPICS,
  type LearnerTopicId,
} from "@/lib/learner-topics";
import type { Attempt, SixState } from "@/lib/learner-types";
import {
  accuracyOf,
  CONFIDENCE_LEVELS,
  countResults,
  type ResultCounts,
} from "@/lib/session-results";

/** Topics appear in Evidence by Topic only after this many clinical answers. */
export const TOPIC_EVIDENCE_MIN = 10;

export type TopicBindingLookup = ReadonlyMap<string, LearnerTopicId | null>;

export type ProgressTopicRow = {
  topic_id: LearnerTopicId;
  name: string;
  answered: number;
  correct: number;
  /** Null until the topic reaches {@link TOPIC_EVIDENCE_MIN} answers. */
  accuracy: number | null;
  visible: boolean;
};

export type FirstToCurrentSummary = {
  classified: Record<ChangeClass, number>;
  insufficient_evidence: number;
};

export type LearnerProgress = {
  has_clinical_evidence: boolean;
  /** Latest valid attempt per compatible clinical identity. */
  current: ResultCounts;
  first_to_current: FirstToCurrentSummary;
  topics: ProgressTopicRow[];
  physiology: ResultCounts;
};

function identityComponentKey(
  attempt: Pick<EvidenceAttempt, "question_id" | "question_version_id">,
  continuity: ContinuityIndex,
): string {
  const versionKey = `${attempt.question_id}\u0000${attempt.question_version_id}`;
  const component =
    continuity.componentOf.get(versionKey) ?? versionKey;
  return `${attempt.question_id}\u0000${component}`;
}

function sortBySequence(
  left: EvidenceAttempt,
  right: EvidenceAttempt,
): number {
  return (
    left.sequence - right.sequence ||
    (left.attempt_id < right.attempt_id
      ? -1
      : left.attempt_id > right.attempt_id
        ? 1
        : 0)
  );
}

function partitionClinicalIdentities(
  attempts: readonly EvidenceAttempt[],
  continuity: ContinuityIndex,
): EvidenceAttempt[][] {
  const clinical = attempts.filter(
    (row) => row.role === "CLINICAL" && isValidEvidence(row),
  );
  const groups = new Map<string, EvidenceAttempt[]>();
  for (const row of clinical) {
    const key = identityComponentKey(row, continuity);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      groups.set(key, [row]);
    }
  }
  return [...groups.values()].map((group) => group.sort(sortBySequence));
}

export function attemptAsEvidence(
  attempt: Attempt,
  physiologyVersionIds: ReadonlySet<string>,
): EvidenceAttempt {
  return {
    attempt_id: attempt.attempt_id,
    learner_id: attempt.learner_id,
    question_id: attempt.question_id,
    question_version_id: attempt.question_version_id,
    correct: attempt.correct,
    confidence: attempt.confidence,
    sequence: attempt.sequence,
    role: physiologyVersionIds.has(attempt.question_version_id)
      ? "PHYSIOLOGY"
      : "CLINICAL",
    validity: "VALID",
  };
}

export function topicIdForVersion(
  questionVersionId: string,
  bindings: TopicBindingLookup,
): LearnerTopicId | null {
  return bindings.get(questionVersionId) ?? null;
}

function summarizeFirstToCurrent(
  groups: EvidenceAttempt[][],
  continuity: ContinuityIndex,
): FirstToCurrentSummary {
  const classified = Object.fromEntries(
    CHANGE_CLASSES.map((key) => [key, 0]),
  ) as Record<ChangeClass, number>;
  let insufficient_evidence = 0;
  for (const group of groups) {
    if (group.length < 2) {
      insufficient_evidence += 1;
      continue;
    }
    const first = group[0]!;
    const latest = group[group.length - 1]!;
    const outcome = classifyChange(first, latest, continuity);
    if (outcome.status === "INSUFFICIENT_EVIDENCE") {
      insufficient_evidence += 1;
    } else {
      classified[outcome.change_class] += 1;
    }
  }
  return { classified, insufficient_evidence };
}

function buildTopicRows(
  clinical: readonly EvidenceAttempt[],
  bindings: TopicBindingLookup,
): ProgressTopicRow[] {
  const tallies = new Map<
    LearnerTopicId,
    { answered: number; correct: number }
  >();
  for (const topic of LEARNER_TOPICS) {
    tallies.set(topic.topic_id, { answered: 0, correct: 0 });
  }
  for (const row of clinical) {
    const topicId = topicIdForVersion(row.question_version_id, bindings);
    if (!topicId) {
      continue;
    }
    const bucket = tallies.get(topicId);
    if (!bucket) {
      continue;
    }
    bucket.answered += 1;
    if (row.correct) {
      bucket.correct += 1;
    }
  }
  return LEARNER_TOPICS.map((topic) => {
    const { answered, correct } = tallies.get(topic.topic_id)!;
    const visible = answered >= TOPIC_EVIDENCE_MIN;
    return {
      topic_id: topic.topic_id,
      name: topic.name,
      answered,
      correct,
      accuracy: visible ? accuracyOf(correct, answered) : null,
      visible,
    };
  });
}

function sixStateFrom(
  correct: boolean,
  confidence: EvidenceAttempt["confidence"],
): SixState {
  return `${correct ? "CORRECT" : "INCORRECT"}_${confidence}` as SixState;
}

/**
 * Progress from committed attempts. Current accuracy uses the latest valid
 * attempt in each compatible clinical identity. Topic evidence counts every
 * valid clinical attempt traced through the exact question version.
 */
export function learnerProgress(input: {
  attempts: readonly EvidenceAttempt[];
  bindings: TopicBindingLookup;
  continuity: ContinuityIndex;
}): LearnerProgress {
  const clinicalValid = input.attempts.filter(
    (row) => row.role === "CLINICAL" && isValidEvidence(row),
  );
  const physiologyValid = input.attempts.filter(
    (row) => row.role === "PHYSIOLOGY" && isValidEvidence(row),
  );
  const identityGroups = partitionClinicalIdentities(
    input.attempts,
    input.continuity,
  );
  const latestPerIdentity = identityGroups.map(
    (group) => group[group.length - 1]!,
  );
  const current = countResults(
    latestPerIdentity.length,
    latestPerIdentity.map((row) => ({
      correct: row.correct,
      confidence: row.confidence,
      six_state: sixStateFrom(row.correct, row.confidence),
    })),
  );
  return {
    has_clinical_evidence: clinicalValid.length > 0,
    current,
    first_to_current: summarizeFirstToCurrent(
      identityGroups,
      input.continuity,
    ),
    topics: buildTopicRows(clinicalValid, input.bindings),
    physiology: countResults(
      physiologyValid.length,
      physiologyValid.map((row) => ({
        correct: row.correct,
        confidence: row.confidence,
        six_state: sixStateFrom(row.correct, row.confidence),
      })),
    ),
  };
}

export { CHANGE_CLASS_LABELS, CONFIDENCE_LEVELS };
