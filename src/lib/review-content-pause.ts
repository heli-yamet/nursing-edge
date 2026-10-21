import {
  questionVersions,
  questions,
  reviewCycles,
} from "@/lib/learner-collections";
import type { QuestionVersion } from "@/lib/learner-types";
import { reviewCycleAfterContentAvailability } from "@/lib/review-rules";
import {
  selectOwnerVersionId,
  type OwnerVersionCandidate,
} from "@/lib/review-session";

export async function syncReviewCyclesForContent(
  questionVersionIds: readonly string[],
  now: Date = new Date(),
): Promise<void> {
  const versionIds = [
    ...new Set(
      questionVersionIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
  if (versionIds.length === 0) {
    return;
  }

  const versionCollection = await questionVersions();
  const seeds = await versionCollection
    .find(
      { question_version_id: { $in: versionIds } },
      { projection: { _id: 0, question_id: 1 } },
    )
    .toArray();
  const questionIds = [...new Set(seeds.map((version) => version.question_id))];
  if (questionIds.length === 0) {
    return;
  }

  const [versionRows, questionRows, cycles] = await Promise.all([
    versionCollection
      .find(
        { question_id: { $in: questionIds } },
        {
          projection: {
            _id: 0,
            question_id: 1,
            question_version_id: 1,
            format: 1,
            publication_status: 1,
            active: 1,
            valid: 1,
            complete: 1,
            stem: 1,
          },
        },
      )
      .toArray(),
    (await questions())
      .find(
        { question_id: { $in: questionIds } },
        { projection: { _id: 0, question_id: 1, status: 1 } },
      )
      .toArray(),
    (await reviewCycles())
      .find(
        {
          question_id: { $in: questionIds },
          state: { $in: ["ACTIVE", "PAUSED"] },
        },
        { projection: { _id: 0 } },
      )
      .toArray(),
  ]);

  const questionById = new Map(
    questionRows.map((question) => [question.question_id, question]),
  );
  const versionsByQuestion = new Map<string, OwnerVersionCandidate[]>();
  for (const version of versionRows) {
    const list = versionsByQuestion.get(version.question_id) ?? [];
    list.push(ownerCandidate(version));
    versionsByQuestion.set(version.question_id, list);
  }

  const servable = new Set(
    questionIds.filter(
      (questionId) =>
        selectOwnerVersionId(
          questionById.get(questionId) ?? null,
          versionsByQuestion.get(questionId) ?? [],
          new Set(),
        ) !== null,
    ),
  );
  const updates = cycles.flatMap((cycle) => {
    const next = reviewCycleAfterContentAvailability(
      cycle,
      servable.has(cycle.question_id),
      now,
    );
    return next ? [next] : [];
  });
  if (updates.length === 0) {
    return;
  }

  await (await reviewCycles()).bulkWrite(
    updates.map((cycle) => ({
      updateOne: {
        filter: {
          cycle_id: cycle.cycle_id,
          state: { $in: ["ACTIVE", "PAUSED"] },
        },
        update: {
          $set: {
            state: cycle.state,
            due_at: cycle.due_at,
            active_window_expires_at: cycle.active_window_expires_at,
            paused_duration_ms: cycle.paused_duration_ms,
            paused_at: cycle.paused_at ?? null,
          },
        },
      },
    })),
  );
}

function ownerCandidate(version: Pick<
  QuestionVersion,
  | "question_version_id"
  | "format"
  | "publication_status"
  | "active"
  | "valid"
  | "complete"
  | "stem"
>): OwnerVersionCandidate {
  return {
    question_version_id: version.question_version_id,
    format: version.format,
    publication_status: version.publication_status,
    active: version.active,
    valid: version.valid,
    complete: version.complete,
    stem: version.stem,
  };
}
