import type { BaselineStore } from "@/lib/calibration-session";
import { calibrations, sessions } from "@/lib/learner-collections";
import { runInTransaction } from "@/lib/mongo";
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
