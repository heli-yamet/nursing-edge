import {
  attempts,
  questionVersions,
  questions,
  reviewCycles,
  sessions,
} from "@/lib/learner-collections";
import { practiceBarredVersionIds } from "@/lib/practice-role";
import { ALL_TOPICS, isPracticeScope } from "@/lib/practice-options";
import { createMongoSessionStore } from "@/lib/mongo-session-store";
import { isDueReviewCycle, isReviewStage, isSixState } from "@/lib/review-rules";
import {
  selectOwnerVersionId,
  startReviewSession,
  type DueOwnerSource,
  type OwnerVersionCandidate,
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
    practiceBarredVersionIds(),
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
  });
}

export async function startLearnerReviewSession(
  learnerId: string,
): Promise<StartReviewResult> {
  const now = new Date();
  return startReviewSession({
    learnerId,
    store: await createMongoSessionStore(),
    loadDue: () => loadDueOwnerSources(learnerId, now),
    now,
  });
}
