import {
  attempts,
  questionVersions,
  reviewTransitions,
  sessions,
} from "@/lib/learner-collections";
import {
  classifyReviewEvidenceOutcome,
  filterAndSummarizeLearningEvidence,
  type EnrichedAttempt,
  type LearningEvidenceFilters,
  type LearningEvidenceSummary,
} from "@/lib/learning-evidence";
import { topicIdForVersion } from "@/lib/learner-progress";
import type {
  QuestionFormat,
  ReviewTransition,
  SessionType,
} from "@/lib/learner-types";
import { reviewOwnerBarredVersionIds } from "@/lib/practice-role";
import { topicBindings } from "@/lib/relationship-collections";
import type { TopicBinding } from "@/lib/relationship-types";
import { learnerTopicForName, type LearnerTopicId } from "@/lib/learner-topics";

function bindingTopicId(row: TopicBinding): LearnerTopicId | null {
  return learnerTopicForName(row.learner_topic_name)?.topic_id ?? null;
}

async function topicBindingsForVersions(
  versionIds: readonly string[],
): Promise<Map<string, LearnerTopicId | null>> {
  const map = new Map<string, LearnerTopicId | null>();
  if (versionIds.length === 0) {
    return map;
  }
  const rows = await (
    await topicBindings()
  )
    .find(
      { question_version: { $in: [...versionIds] } },
      { projection: { _id: 0 } },
    )
    .toArray();
  const bestRevision = new Map<string, TopicBinding>();
  for (const row of rows) {
    const existing = bestRevision.get(row.question_version);
    if (
      !existing ||
      row.topic_mapping_revision > existing.topic_mapping_revision
    ) {
      bestRevision.set(row.question_version, row);
    }
  }
  for (const versionId of versionIds) {
    const row = bestRevision.get(versionId);
    map.set(versionId, row ? bindingTopicId(row) : null);
  }
  return map;
}

function attemptQueryForFilters(filters: LearningEvidenceFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  if (filters.from !== null || filters.to !== null) {
    const committed_at: Record<string, Date> = {};
    if (filters.from !== null) {
      committed_at.$gte = filters.from;
    }
    if (filters.to !== null) {
      committed_at.$lte = filters.to;
    }
    query.committed_at = committed_at;
  }
  if (filters.confidence !== null) {
    query.confidence = filters.confidence;
  }
  if (filters.six_state !== null) {
    query.six_state = filters.six_state;
  }
  return query;
}

export async function loadLearningEvidence(
  filters: LearningEvidenceFilters,
): Promise<LearningEvidenceSummary> {
  const attemptRows = await (
    await attempts()
  )
    .find(attemptQueryForFilters(filters), { projection: { _id: 0 } })
    .toArray();

  const sessionIds = [...new Set(attemptRows.map((row) => row.session_id))];
  const sessionRows =
    sessionIds.length === 0
      ? []
      : await (
          await sessions()
        )
          .find(
            { session_id: { $in: sessionIds } },
            { projection: { _id: 0, session_id: 1, type: 1 } },
          )
          .toArray();
  const sessionTypes = new Map<string, SessionType>(
    sessionRows.map((row) => [row.session_id, row.type]),
  );

  const versionIds = [
    ...new Set(attemptRows.map((row) => row.question_version_id)),
  ];
  const [versionRows, bindings, physiologyVersions, transitionRows] =
    await Promise.all([
      versionIds.length === 0
        ? []
        : (await questionVersions())
            .find(
              { question_version_id: { $in: versionIds } },
              { projection: { _id: 0, question_version_id: 1, format: 1 } },
            )
            .toArray(),
      topicBindingsForVersions(versionIds),
      reviewOwnerBarredVersionIds(),
      attemptRows.length === 0
        ? []
        : (await reviewTransitions())
            .find(
              {
                attempt_id: {
                  $in: attemptRows.map((row) => row.attempt_id),
                },
              },
              { projection: { _id: 0 } },
            )
            .toArray(),
    ]);

  const formats = new Map<string, QuestionFormat>();
  for (const row of versionRows) {
    if (row.format === "MCQ" || row.format === "SATA") {
      formats.set(row.question_version_id, row.format);
    }
  }

  const transitionsByAttempt = new Map<string, ReviewTransition[]>();
  for (const row of transitionRows) {
    const bucket = transitionsByAttempt.get(row.attempt_id);
    if (bucket) {
      bucket.push(row);
    } else {
      transitionsByAttempt.set(row.attempt_id, [row]);
    }
  }

  const enriched: EnrichedAttempt[] = [];
  for (const row of attemptRows) {
    const sessionType = sessionTypes.get(row.session_id) ?? "PRACTICE";
    const format = formats.get(row.question_version_id);
    if (!format) {
      continue;
    }
    const topic_id = topicIdForVersion(row.question_version_id, bindings);
    const review_outcome = classifyReviewEvidenceOutcome(
      sessionType,
      transitionsByAttempt.get(row.attempt_id) ?? [],
    );
    enriched.push({
      attempt_id: row.attempt_id,
      learner_id: row.learner_id,
      committed_at: row.committed_at,
      correct: row.correct,
      confidence: row.confidence,
      six_state: row.six_state,
      question_version_id: row.question_version_id,
      session_type: sessionType,
      format,
      topic_id,
      review_outcome,
      role: physiologyVersions.has(row.question_version_id)
        ? "PHYSIOLOGY"
        : "CLINICAL",
    });
  }

  return filterAndSummarizeLearningEvidence({
    attempts: enriched,
    filters,
  });
}
