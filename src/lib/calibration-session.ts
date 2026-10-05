import { CALIBRATION_BLUEPRINT_SIZE } from "@/lib/calibration-blueprint";
import type { CalibrationAssignment } from "@/lib/calibration-entry";
import { newPermanentId } from "@/lib/ids";
import {
  CURRENT_RULE_SET_VERSION,
  type Calibration,
  type CalibrationBlueprint,
  type Session,
} from "@/lib/learner-types";
import { ALL_TOPICS } from "@/lib/practice-options";
import { sessionQuestionsAreUnique } from "@/lib/session-rules";

export type BaselineStore = {
  findActive(learner_id: string): Promise<Session | null>;
  readCalibration(learner_id: string): Promise<Calibration | null>;
  startBaseline(
    session: Session,
    calibration: Calibration,
  ): Promise<"inserted" | "duplicate">;
};

export type BaselinePlan = {
  blueprint: Pick<CalibrationBlueprint, "blueprint_id" | "version"> | null;
  assignment: CalibrationAssignment;
};

export type StartBaselineResult =
  | { result: "created"; session: Session }
  | { result: "already_active"; session: Session }
  | { result: "not_offered" }
  | { result: "unavailable" }
  | { result: "not_authorized" };

export async function startBaselineSession(input: {
  learnerId: string;
  store: BaselineStore;
  hasAccess: () => Promise<boolean>;
  loadPlan: () => Promise<BaselinePlan>;
  now?: Date;
  newId?: () => string;
}): Promise<StartBaselineResult> {
  if (!(await input.hasAccess())) {
    return { result: "not_authorized" };
  }

  const existing = await input.store.findActive(input.learnerId);
  if (existing) {
    return { result: "already_active", session: existing };
  }

  if (await input.store.readCalibration(input.learnerId)) {
    return { result: "not_offered" };
  }

  const plan = await input.loadPlan();
  if (!plan.blueprint || !plan.assignment.ok) {
    return { result: "unavailable" };
  }
  const assigned = plan.assignment.assigned_versions;
  if (
    assigned.length !== CALIBRATION_BLUEPRINT_SIZE ||
    !sessionQuestionsAreUnique(assigned)
  ) {
    throw new Error("baseline assignment broke its size or uniqueness rule");
  }

  const newId = input.newId ?? newPermanentId;
  const now = input.now ?? new Date();
  const session: Session = {
    session_id: newId(),
    learner_id: input.learnerId,
    type: "CALIBRATION",
    scope: ALL_TOPICS,
    size: CALIBRATION_BLUEPRINT_SIZE,
    state: "ACTIVE",
    assigned_versions: assigned,
    created_at: now,
    rule_set_version: CURRENT_RULE_SET_VERSION,
  };
  const calibration: Calibration = {
    calibration_id: newId(),
    learner_id: input.learnerId,
    state: "STARTED",
    blueprint_id: plan.blueprint.blueprint_id,
    blueprint_version: plan.blueprint.version,
    assigned_versions: assigned,
    started_at: now,
    completed_at: null,
    declined_at: null,
    created_at: now,
  };

  if ((await input.store.startBaseline(session, calibration)) === "inserted") {
    return { result: "created", session };
  }

  const winner = await input.store.findActive(input.learnerId);
  return winner
    ? { result: "already_active", session: winner }
    : { result: "not_offered" };
}

export type MemoryBaselineStore = BaselineStore & {
  sessions: Session[];
  calibrations: Calibration[];
};

export function createMemoryBaselineStore(): MemoryBaselineStore {
  const sessions: Session[] = [];
  const calibrations: Calibration[] = [];
  return {
    sessions,
    calibrations,
    async findActive(learner_id) {
      return (
        sessions.find(
          (session) =>
            session.learner_id === learner_id && session.state === "ACTIVE",
        ) ?? null
      );
    },
    async readCalibration(learner_id) {
      return calibrations.find((row) => row.learner_id === learner_id) ?? null;
    },
    async startBaseline(session, calibration) {
      const activeTaken = sessions.some(
        (row) => row.learner_id === session.learner_id && row.state === "ACTIVE",
      );
      const calibrationTaken = calibrations.some(
        (row) => row.learner_id === calibration.learner_id,
      );
      if (activeTaken || calibrationTaken) {
        return "duplicate";
      }
      sessions.push(structuredClone(session));
      calibrations.push(structuredClone(calibration));
      return "inserted";
    },
  };
}
