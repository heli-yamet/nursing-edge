import { findFullAttemptsByLearner } from "@/lib/learner-collections";
import { EMPTY_CONTINUITY } from "@/lib/change-evidence";
import {
  attemptAsEvidence,
  learnerProgress,
  type LearnerProgress,
  type TopicBindingLookup,
} from "@/lib/learner-progress";
import { learnerTopicForName, type LearnerTopicId } from "@/lib/learner-topics";
import { reviewOwnerBarredVersionIds } from "@/lib/practice-role";
import { topicBindings } from "@/lib/relationship-collections";
import type { TopicBinding } from "@/lib/relationship-types";

function bindingTopicId(row: TopicBinding): LearnerTopicId | null {
  return learnerTopicForName(row.learner_topic_name)?.topic_id ?? null;
}

async function topicBindingsForVersions(
  versionIds: readonly string[],
): Promise<TopicBindingLookup> {
  const map: Map<string, LearnerTopicId | null> = new Map();
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

export async function readLearnerProgress(
  learnerId: string,
): Promise<LearnerProgress> {
  const [attemptRows, physiologyVersions] = await Promise.all([
    findFullAttemptsByLearner(learnerId),
    reviewOwnerBarredVersionIds(),
  ]);
  const versionIds = [
    ...new Set(attemptRows.map((row) => row.question_version_id)),
  ];
  const bindings = await topicBindingsForVersions(versionIds);
  const evidence = attemptRows.map((row) =>
    attemptAsEvidence(row, physiologyVersions),
  );
  return learnerProgress({
    attempts: evidence,
    bindings,
    continuity: EMPTY_CONTINUITY,
  });
}
