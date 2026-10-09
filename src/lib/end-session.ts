import type { Calibration, Session, SessionType } from "@/lib/learner-types";

export const END_SESSION_CONFIRMATION =
  "End your current session? Your submitted answers will remain saved. Questions you have not submitted will not count as attempts.";

export type EndSessionStore = {
  findActive(learnerId: string): Promise<Session | null>;
  attemptCount(sessionId: string): Promise<number>;
  markEnded(sessionId: string, learnerId: string): Promise<boolean>;
  completeCalibration(learnerId: string, completedAt: Date): Promise<void>;
};

export type EndSessionResult =
  | {
      result: "ended";
      submitted: number;
      size: number;
      type: Extract<SessionType, "PRACTICE" | "CALIBRATION">;
    }
  | { result: "no_session" }
  | { result: "not_playable" };

export function endedSessionCopy(submitted: number): string {
  const answers = submitted === 1 ? "answer" : "answers";
  return `You submitted ${submitted} ${answers}. Questions you have not submitted did not count as attempts.`;
}

export async function endCurrentSession(input: {
  learnerId: string;
  store: EndSessionStore;
  now?: Date;
}): Promise<EndSessionResult> {
  const session = await input.store.findActive(input.learnerId);
  if (!session) {
    return { result: "no_session" };
  }
  if (session.type !== "PRACTICE" && session.type !== "CALIBRATION") {
    return { result: "not_playable" };
  }

  const submitted = await input.store.attemptCount(session.session_id);
  const ended = await input.store.markEnded(
    session.session_id,
    input.learnerId,
  );
  if (!ended) {
    return { result: "no_session" };
  }
  if (session.type === "CALIBRATION") {
    await input.store.completeCalibration(
      input.learnerId,
      input.now ?? new Date(),
    );
  }

  return {
    result: "ended",
    submitted,
    size: session.assigned_versions.length,
    type: session.type,
  };
}

export type MemoryEndStore = EndSessionStore & {
  sessions: Session[];
  attempts: number;
  calibrations: Calibration[];
};

export function createMemoryEndStore(input: {
  session: Session | null;
  attemptCount?: number;
  calibration?: Calibration | null;
}): MemoryEndStore {
  const sessions = input.session ? [structuredClone(input.session)] : [];
  const calibrations = input.calibration
    ? [structuredClone(input.calibration)]
    : [];
  const attempts = input.attemptCount ?? 0;
  return {
    sessions,
    attempts,
    calibrations,
    async findActive(learnerId) {
      const found = sessions.find(
        (session) =>
          session.learner_id === learnerId && session.state === "ACTIVE",
      );
      return found ? structuredClone(found) : null;
    },
    async attemptCount(sessionId) {
      return sessions.some((session) => session.session_id === sessionId)
        ? attempts
        : 0;
    },
    async markEnded(sessionId, learnerId) {
      const session = sessions.find(
        (item) =>
          item.session_id === sessionId &&
          item.learner_id === learnerId &&
          item.state === "ACTIVE",
      );
      if (!session) {
        return false;
      }
      session.state = "ENDED";
      session.draft = null;
      session.held_position = null;
      return true;
    },
    async completeCalibration(learnerId, completedAt) {
      const calibration = calibrations.find(
        (item) => item.learner_id === learnerId && item.state === "STARTED",
      );
      if (!calibration) {
        return;
      }
      calibration.state = "COMPLETED";
      calibration.completed_at = completedAt;
    },
  };
}
