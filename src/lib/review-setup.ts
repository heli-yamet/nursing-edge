import {
  questionVersions,
  questions,
  reviewCycles,
} from "@/lib/learner-collections";
import { practiceBarredVersionIds } from "@/lib/practice-role";
import { createMongoSessionStore } from "@/lib/mongo-session-store";
import { isDueReviewCycle } from "@/lib/review-rules";
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
  state: 1,
  due_at: 1,
  active_window_expires_at: 1,
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
  const [versionRows, questionRows, barred] = await Promise.all([
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
        { projection: { _id: 0, question_id: 1, status: 1 } },
      )
      .toArray(),
    practiceBarredVersionIds(),
  ]);

  const questionById = new Map(
    questionRows.map((question) => [question.question_id, question]),
  );
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

  return due.map((cycle) => ({
    cycle_id: cycle.cycle_id,
    question_id: cycle.question_id,
    due_at: cycle.due_at,
    question_version_id: selectOwnerVersionId(
      questionById.get(cycle.question_id) ?? null,
      versionsByQuestion.get(cycle.question_id) ?? [],
      barred,
    ),
  }));
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
