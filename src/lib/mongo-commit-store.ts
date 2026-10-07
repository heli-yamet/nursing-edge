import {
  commitSessionAnswer,
  readCommittedPosition,
  type CommitAnswerResult,
  type CommitStore,
  type CommittedReadResult,
  type ScoredVersion,
} from "@/lib/commit-answer";
import {
  attempts,
  questionVersions,
  questions,
  reviewCycles,
  reviewTransitions,
  sessions,
} from "@/lib/learner-collections";
import { learnerTopicName } from "@/lib/learner-topics";
import type { ClientSession } from "mongodb";
import { runInTransaction } from "@/lib/mongo";

function duplicatePattern(error: unknown): Record<string, unknown> | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  if (error.code !== 11000) {
    return null;
  }
  if (
    !("keyPattern" in error) ||
    typeof error.keyPattern !== "object" ||
    error.keyPattern === null
  ) {
    return {};
  }
  return error.keyPattern as Record<string, unknown>;
}

function isDuplicate(error: unknown, keys: string[]): boolean {
  const pattern = duplicatePattern(error);
  if (!pattern) {
    return false;
  }
  return keys.every((key) => key in pattern);
}

export async function createMongoCommitStore(
  mongoSession?: ClientSession,
): Promise<CommitStore> {
  const [
    sessionRows,
    attemptRows,
    cycleRows,
    transitionRows,
    versionRows,
    questionRows,
  ] = await Promise.all([
    sessions(),
    attempts(),
    reviewCycles(),
    reviewTransitions(),
    questionVersions(),
    questions(),
  ]);
  const transaction = mongoSession ? { session: mongoSession } : {};

  return {
    async findActive(learnerId) {
      return sessionRows.findOne(
        { learner_id: learnerId, state: "ACTIVE" },
        { projection: { _id: 0 }, ...transaction },
      );
    },
    async findAttempt(sessionId, position) {
      return attemptRows.findOne(
        { session_id: sessionId, position },
        { projection: { _id: 0 }, ...transaction },
      );
    },
    async committedPositions(sessionId) {
      const rows = await attemptRows
        .find(
          { session_id: sessionId },
          { projection: { _id: 0, position: 1 }, ...transaction },
        )
        .toArray();
      return rows.map((row) => row.position);
    },
    async sequencesForQuestion(learnerId, questionId) {
      const rows = await attemptRows
        .find(
          { learner_id: learnerId, question_id: questionId },
          { projection: { _id: 0, sequence: 1 }, ...transaction },
        )
        .toArray();
      return rows.map((row) => row.sequence);
    },
    async findActiveCycle(learnerId, questionId) {
      return cycleRows.findOne(
        { learner_id: learnerId, question_id: questionId, state: "ACTIVE" },
        { projection: { _id: 0 }, ...transaction },
      );
    },
    async loadVersion(questionVersionId) {
      const version = await versionRows.findOne(
        { question_version_id: questionVersionId },
        {
          projection: {
            _id: 0,
            question_version_id: 1,
            question_id: 1,
            format: 1,
            learner_core_rationale: 1,
            correct_option_ids: 1,
            "options.option_id": 1,
            "options.displayed_option": 1,
            "options.option_text": 1,
          },
          ...transaction,
        },
      );
      if (
        !version?.options ||
        !version.correct_option_ids ||
        typeof version.learner_core_rationale !== "string" ||
        (version.format !== "MCQ" && version.format !== "SATA")
      ) {
        return null;
      }
      const scored: ScoredVersion = {
        question_version_id: version.question_version_id,
        question_id: version.question_id,
        format: version.format,
        options: version.options.map((option) => ({
          option_id: option.option_id,
          displayed_option: option.displayed_option,
          option_text: option.option_text,
        })),
        correct_option_ids: version.correct_option_ids,
        learner_core_rationale: version.learner_core_rationale,
      };
      return scored;
    },
    async loadTopicName(questionId) {
      const question = await questionRows.findOne(
        { question_id: questionId },
        { projection: { _id: 0, topic_id: 1 }, ...transaction },
      );
      if (!question?.topic_id) {
        return null;
      }
      return learnerTopicName(question.topic_id);
    },
    async stampRuleSet(sessionId, ruleSetVersion) {
      await sessionRows.updateOne(
        { session_id: sessionId },
        { $set: { rule_set_version: ruleSetVersion } },
        transaction,
      );
    },
    async insertAttempt(attempt) {
      try {
        await attemptRows.insertOne({ ...attempt }, transaction);
        return "inserted";
      } catch (error) {
        if (isDuplicate(error, ["session_id", "position"])) {
          return "duplicate";
        }
        throw error;
      }
    },
    async insertReviewEntry(cycle, transition) {
      try {
        await cycleRows.insertOne({ ...cycle }, transaction);
      } catch (error) {
        if (isDuplicate(error, ["learner_id", "question_id"])) {
          return "already_active";
        }
        throw error;
      }
      await transitionRows.insertOne({ ...transition }, transaction);
      return "inserted";
    },
  };
}

export async function commitLearnerAnswer(input: {
  learnerId: string;
  position: unknown;
  questionVersionId: unknown;
  selectedOptionIds: unknown;
  confidence: unknown;
}): Promise<CommitAnswerResult> {
  return runInTransaction(async (mongoSession) => {
    const store = await createMongoCommitStore(mongoSession);
    return commitSessionAnswer({ ...input, store });
  });
}

export async function readLearnerCommittedPosition(input: {
  learnerId: string;
  position: unknown;
}): Promise<CommittedReadResult> {
  const store = await createMongoCommitStore();
  return readCommittedPosition({ ...input, store });
}
