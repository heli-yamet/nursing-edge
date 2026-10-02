import { listEligibleVersions } from "@/lib/eligibility-report";
import { LEARNER_TOPICS, type LearnerTopicId } from "@/lib/learner-topics";
import type {
  AssignedVersion,
  Question,
  QuestionVersion,
} from "@/lib/learner-types";
import {
  ALL_TOPICS,
  sizeIsAvailable,
  TOPIC_IDS,
  type PracticeScope,
  type PracticeSize,
  type PracticeSupply,
} from "@/lib/practice-options";

export type PracticeCandidate = {
  question_id: string;
  question_version_id: string;
  topic_id: LearnerTopicId;
};

export function practiceCandidates(
  versions: QuestionVersion[],
  questions: Map<string, Question>,
  reservedIds: ReadonlySet<string> = new Set(),
): PracticeCandidate[] {
  const byQuestion = new Map<string, PracticeCandidate>();
  for (const version of listEligibleVersions(versions, reservedIds)) {
    const question = questions.get(version.question_id);
    if (!question || question.status !== "ACTIVE") {
      continue;
    }
    if (!TOPIC_IDS.has(question.topic_id)) {
      continue;
    }
    const current = byQuestion.get(version.question_id);
    if (
      current &&
      current.question_version_id.localeCompare(
        version.question_version_id,
        undefined,
        { numeric: true },
      ) >= 0
    ) {
      continue;
    }
    byQuestion.set(version.question_id, {
      question_id: version.question_id,
      question_version_id: version.question_version_id,
      topic_id: question.topic_id as LearnerTopicId,
    });
  }
  return [...byQuestion.values()];
}

export function candidatesInScope(
  candidates: PracticeCandidate[],
  scope: PracticeScope,
): PracticeCandidate[] {
  if (scope === ALL_TOPICS) {
    return candidates;
  }
  return candidates.filter((candidate) => candidate.topic_id === scope);
}

export function practiceSupply(candidates: PracticeCandidate[]): PracticeSupply {
  const supply = { [ALL_TOPICS]: candidates.length } as PracticeSupply;
  for (const topic of LEARNER_TOPICS) {
    supply[topic.topic_id] = 0;
  }
  for (const candidate of candidates) {
    supply[candidate.topic_id] += 1;
  }
  return supply;
}

export function lastAttemptByQuestion(
  attempts: { question_version_id: string; committed_at: Date }[],
  versionToQuestion: Map<string, string>,
): Map<string, Date> {
  const latest = new Map<string, Date>();
  for (const attempt of attempts) {
    const question_id = versionToQuestion.get(attempt.question_version_id);
    if (!question_id) {
      continue;
    }
    const previous = latest.get(question_id);
    if (!previous || attempt.committed_at.getTime() > previous.getTime()) {
      latest.set(question_id, attempt.committed_at);
    }
  }
  return latest;
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export type PracticeSelection =
  | { ok: true; assigned_versions: AssignedVersion[] }
  | { ok: false; reason: "insufficient_supply" };

export function selectPracticeVersions(input: {
  candidates: PracticeCandidate[];
  scope: PracticeScope;
  size: PracticeSize;
  lastAttemptedAt: Map<string, Date>;
  random?: () => number;
}): PracticeSelection {
  const random = input.random ?? Math.random;
  const pool = candidatesInScope(input.candidates, input.scope);
  if (!sizeIsAvailable(pool.length, input.size)) {
    return { ok: false, reason: "insufficient_supply" };
  }

  const unseen = pool.filter(
    (candidate) => !input.lastAttemptedAt.has(candidate.question_id),
  );
  const seen = shuffle(
    pool.filter((candidate) => input.lastAttemptedAt.has(candidate.question_id)),
    random,
  ).sort(
    (a, b) =>
      (input.lastAttemptedAt.get(a.question_id)?.getTime() ?? 0) -
      (input.lastAttemptedAt.get(b.question_id)?.getTime() ?? 0),
  );

  const picked = [...shuffle(unseen, random), ...seen].slice(0, input.size);
  return {
    ok: true,
    assigned_versions: shuffle(picked, random).map((candidate, index) => ({
      position: index + 1,
      question_id: candidate.question_id,
      question_version_id: candidate.question_version_id,
    })),
  };
}
