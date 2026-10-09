import type { BaselineStore } from "@/lib/calibration-session";
import {
  endCurrentSession,
  type EndSessionResult,
  type EndSessionStore,
} from "@/lib/end-session";
import { attempts, calibrations, sessions } from "@/lib/learner-collections";
import { runInTransaction } from "@/lib/mongo";
import type { ClientSession } from "mongodb";
import type { SessionStore } from "@/lib/practice-session";

function duplicateKey(error: unknown): Record<string, unknown> | null | false {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  if (error.code !== 11000) {
    return false;
  }
  return "keyPattern" in error && typeof error.keyPattern === "object"
    ? (error.keyPattern as Record<string, unknown> | null)
    : null;
}

function isLearnerDuplicate(error: unknown): boolean {
  const keyPattern = duplicateKey(error);
  if (keyPattern === false) {
    return false;
  }
  return !keyPattern || "learner_id" in keyPattern;
}

export async function createMongoSessionStore(): Promise<SessionStore> {
  const collection = await sessions();
  return {
    async findActive(learner_id) {
      return collection.findOne(
        { learner_id, state: "ACTIVE" },
        { projection: { _id: 0 } },
      );
    },
    async insert(session) {
      try {
        await collection.insertOne({ ...session });
        return "inserted";
      } catch (error) {
        if (isLearnerDuplicate(error)) {
          return "duplicate_active";
        }
        throw error;
      }
    },
  };
}

export async function createMongoBaselineStore(): Promise<BaselineStore> {
  const sessionRows = await sessions();
  const calibrationRows = await calibrations();
  return {
    async findActive(learner_id) {
      return sessionRows.findOne(
        { learner_id, state: "ACTIVE" },
        { projection: { _id: 0 } },
      );
    },
    async readCalibration(learner_id) {
      return calibrationRows.findOne({ learner_id }, { projection: { _id: 0 } });
    },
    async startBaseline(session, calibration) {
      try {
        await runInTransaction(async (transaction) => {
          await sessionRows.insertOne({ ...session }, { session: transaction });
          await calibrationRows.insertOne(
            { ...calibration },
            { session: transaction },
          );
        });
        return "inserted";
      } catch (error) {
        if (isLearnerDuplicate(error)) {
          return "duplicate";
        }
        throw error;
      }
    },
  };
}

async function createMongoEndStore(
  mongoSession: ClientSession,
): Promise<EndSessionStore> {
  const sessionRows = await sessions();
  const attemptRows = await attempts();
  const calibrationRows = await calibrations();
  const transaction = { session: mongoSession };
  return {
    async findActive(learnerId) {
      return sessionRows.findOne(
        { learner_id: learnerId, state: "ACTIVE" },
        { projection: { _id: 0 }, ...transaction },
      );
    },
    async attemptCount(sessionId) {
      return attemptRows.countDocuments({ session_id: sessionId }, transaction);
    },
    async markEnded(sessionId, learnerId) {
      const updated = await sessionRows.updateOne(
        { session_id: sessionId, learner_id: learnerId, state: "ACTIVE" },
        { $set: { state: "ENDED" }, $unset: { draft: "", held_position: "" } },
        transaction,
      );
      return updated.matchedCount === 1;
    },
    async completeCalibration(learnerId, completedAt) {
      await calibrationRows.updateOne(
        { learner_id: learnerId, state: "STARTED" },
        { $set: { state: "COMPLETED", completed_at: completedAt } },
        transaction,
      );
    },
  };
}

export async function endLearnerSession(
  learnerId: string,
): Promise<EndSessionResult> {
  return runInTransaction(async (mongoSession) => {
    const store = await createMongoEndStore(mongoSession);
    return endCurrentSession({ learnerId, store });
  });
}

export async function readLatestEndedSummary(learnerId: string): Promise<{
  submitted: number;
  size: number;
} | null> {
  const ended = await (await sessions()).findOne(
    {
      learner_id: learnerId,
      state: "ENDED",
      type: { $in: ["PRACTICE", "CALIBRATION"] },
    },
    {
      projection: { _id: 0, session_id: 1, assigned_versions: 1 },
      sort: { created_at: -1 },
    },
  );
  if (!ended) {
    return null;
  }
  const submitted = await (await attempts()).countDocuments({
    session_id: ended.session_id,
  });
  return { submitted, size: ended.assigned_versions.length };
}
