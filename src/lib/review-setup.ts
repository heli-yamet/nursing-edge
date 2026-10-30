import {
  attempts,
  questionVersions,
  questions,
  reviewCycles,
  sessions,
} from "@/lib/learner-collections";
import { reviewOwnerBarredVersionIds } from "@/lib/practice-role";
import { loadApprovedReviewOffers } from "@/lib/review-offers";
import { maps } from "@/lib/relationship-collections";
import { ALL_TOPICS, isPracticeScope } from "@/lib/practice-options";
import { createMongoSessionStore } from "@/lib/mongo-session-store";
import { reviewOutlook, type ReviewOutlook } from "@/lib/review-outlook";
import { isDueReviewCycle, isReviewStage, isSixState } from "@/lib/review-rules";
import {
  previewDueReview,
  selectOwnerVersionId,
  startReviewSession,
  type DueOwnerSource,
  type OwnerVersionCandidate,
  type ReviewPreview,
  type StartReviewResult,
} from "@/lib/review-session";

const DUE_CYCLE_PROJECTION = {
  _id: 0,
  cycle_id: 1,
  question_id: 1,
  stage: 1,
  state: 1,
  due_at: 1,
  active_window_expires_at: 1,
  triggering_six_state: 1,
} as const;

export async function learnerHasDueReview(
  learnerId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const cycle = await (
    await reviewCycles()
  ).findOne(
    {
      learner_id: learnerId,
      state: "ACTIVE",
      due_at: { $lte: now },
      active_window_expires_at: { $gt: now },
    },
    { projection: { _id: 1 } },
  );
  return cycle !== null;
}

export async function readReviewOutlook(
  learnerId: string,
  now: Date = new Date(),
): Promise<ReviewOutlook> {
  const cycles = await (
    await reviewCycles()
  )
    .find(
      { learner_id: learnerId },
      {
        projection: {
          _id: 0,
          state: 1,
          due_at: 1,
          active_window_expires_at: 1,
        },
      },
    )
    .toArray();
  return reviewOutlook(cycles, now);
}

export async function loadDueOwnerSources(
  learnerId: string,
  now: Date = new Date(),
): Promise<DueOwnerSource[]> {
  const cycles = await (
    await reviewCycles()
  )
    .find(
      {
        learner_id: learnerId,
        state: "ACTIVE",
        due_at: { $lte: now },
        active_window_expires_at: { $gt: now },
      },
      { projection: DUE_CYCLE_PROJECTION },
    )
    .toArray();
  const due = cycles.filter((cycle) => isDueReviewCycle(cycle, now));
  if (due.length === 0) {
    return [];
  }

  const questionIds = [...new Set(due.map((cycle) => cycle.question_id))];
  const [versionRows, questionRows, barred, attemptRows, latestPractice] =
    await Promise.all([
    (await questionVersions())
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
        { projection: { _id: 0, question_id: 1, status: 1, topic_id: 1 } },
      )
      .toArray(),
    reviewOwnerBarredVersionIds(),
    (await attempts())
      .find(
        { learner_id: learnerId, question_id: { $in: questionIds } },
        { projection: { _id: 0, question_id: 1, committed_at: 1 } },
      )
      .toArray(),
    (await sessions())
      .find(
        { learner_id: learnerId, type: "PRACTICE" },
        { projection: { _id: 0, scope: 1, created_at: 1 } },
      )
      .sort({ created_at: -1 })
      .limit(1)
      .toArray(),
  ]);

  const questionById = new Map(
    questionRows.map((question) => [question.question_id, question]),
  );
  const variantByVersion = await ownerVariantByVersion(
    versionRows.map((version) => version.question_version_id),
  );
  const lastAttemptAt = new Map<string, Date>();
  for (const attempt of attemptRows) {
    const previous = lastAttemptAt.get(attempt.question_id);
    if (!previous || attempt.committed_at.getTime() > previous.getTime()) {
      lastAttemptAt.set(attempt.question_id, attempt.committed_at);
    }
  }
  const practiceScope = latestPractice[0]?.scope;
  const focusedTopic =
    isPracticeScope(practiceScope) && practiceScope !== ALL_TOPICS
      ? practiceScope
      : null;
  const versionsByQuestion = new Map<string, OwnerVersionCandidate[]>();
  for (const version of versionRows) {
    const candidate: OwnerVersionCandidate = {
      question_version_id: version.question_version_id,
      format: version.format,
      publication_status: version.publication_status,
      active: version.active,
      valid: version.valid,
      complete: version.complete,
      stem: version.stem,
    };
    const list = versionsByQuestion.get(version.question_id) ?? [];
    list.push(candidate);
    versionsByQuestion.set(version.question_id, list);
  }

  return due.map((cycle) => {
    const question = questionById.get(cycle.question_id) ?? null;
    const stage = isReviewStage(cycle.stage) ? cycle.stage : null;
    return {
      cycle_id: cycle.cycle_id,
      question_id: cycle.question_id,
      stage: stage ?? "REPAIR",
      due_at: cycle.due_at,
      triggering_six_state: isSixState(cycle.triggering_six_state)
        ? cycle.triggering_six_state
        : null,
      last_owner_attempt_at: lastAttemptAt.get(cycle.question_id) ?? null,
      in_focus: focusedTopic !== null && question?.topic_id === focusedTopic,
      question_version_id: stage
        ? selectOwnerVersionId(
            question,
            versionsByQuestion.get(cycle.question_id) ?? [],
            barred,
          )
        : null,
    };
  }).map((source) => ({
    ...source,
    variant_group_id: source.question_version_id
      ? (variantByVersion.get(source.question_version_id) ?? null)
      : null,
  }));
}

async function ownerVariantByVersion(
  versionIds: readonly string[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(versionIds.filter((id) => id.length > 0))];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await (
    await maps()
  )
    .find(
      { question_version: { $in: ids } },
      {
        projection: {
          _id: 0,
          question_version: 1,
          map_revision: 1,
          variant_group_id: 1,
        },
      },
    )
    .toArray();
  const variants = new Map<string, string | null>();
  for (const versionId of ids) {
    const matches = rows.filter(
      (row) =>
        row.question_version === versionId && typeof row.map_revision === "number",
    );
    if (matches.length === 0) {
      variants.set(versionId, null);
      continue;
    }
    const top = Math.max(...matches.map((row) => row.map_revision));
    const current = matches.filter((row) => row.map_revision === top);
    const values = new Set(
      current.map((row) =>
        typeof row.variant_group_id === "string" ? row.variant_group_id : "",
      ),
    );
    variants.set(versionId, values.size === 1 ? ([...values][0] ?? null) || null : null);
  }
  return variants;
}

export async function loadReviewPreview(
  learnerId: string,
  now: Date = new Date(),
): Promise<ReviewPreview> {
  return previewDueReview(await loadDueOwnerSources(learnerId, now));
}

export async function startLearnerReviewSession(
  learnerId: string,
): Promise<StartReviewResult> {
  const now = new Date();
  return startReviewSession({
    learnerId,
    store: await createMongoSessionStore(),
    loadDue: () => loadDueOwnerSources(learnerId, now),
    loadOffers: (due) => loadApprovedReviewOffers(learnerId, due),
    now,
  });
}
