import { newPermanentId } from "@/lib/ids";
import type { Session } from "@/lib/learner-types";
import {
  isPracticeScope,
  isPracticeSize,
  type PracticeScope,
  type PracticeSize,
} from "@/lib/practice-options";
import {
  selectPracticeVersions,
  type PracticeCandidate,
} from "@/lib/practice-selection";
import { sessionQuestionsAreUnique } from "@/lib/session-rules";

export type SessionStore = {
  findActive(learner_id: string): Promise<Session | null>;
  insert(session: Session): Promise<"inserted" | "duplicate_active">;
};

export type PracticePool = {
  candidates: PracticeCandidate[];
  lastAttemptedAt: Map<string, Date>;
};

export type StartSessionResult =
  | { result: "created"; session: Session }
  | { result: "already_active"; session: Session }
  | { result: "insufficient_supply" }
  | { result: "invalid_request" }
  | { result: "not_authorized" };

export async function startPracticeSession(input: {
  learnerId: string;
  scope: unknown;
  size: unknown;
  store: SessionStore;
  hasAccess: () => Promise<boolean>;
  loadPool: () => Promise<PracticePool>;
  now?: Date;
  random?: () => number;
  newId?: () => string;
}): Promise<StartSessionResult> {
  if (!isPracticeScope(input.scope) || !isPracticeSize(input.size)) {
    return { result: "invalid_request" };
  }
  const scope: PracticeScope = input.scope;
  const size: PracticeSize = input.size;

  if (!(await input.hasAccess())) {
    return { result: "not_authorized" };
  }

  const existing = await input.store.findActive(input.learnerId);
  if (existing) {
    return { result: "already_active", session: existing };
  }

  const pool = await input.loadPool();
  const selection = selectPracticeVersions({
    candidates: pool.candidates,
    scope,
    size,
    lastAttemptedAt: pool.lastAttemptedAt,
    random: input.random,
  });
  if (!selection.ok) {
    return { result: "insufficient_supply" };
  }
  if (
    selection.assigned_versions.length !== size ||
    !sessionQuestionsAreUnique(selection.assigned_versions)
  ) {
    throw new Error("practice selection broke its size or uniqueness rule");
  }

  const session: Session = {
    session_id: (input.newId ?? newPermanentId)(),
    learner_id: input.learnerId,
    type: "PRACTICE",
    scope,
    size,
    state: "ACTIVE",
    assigned_versions: selection.assigned_versions,
    created_at: input.now ?? new Date(),
  };

  if ((await input.store.insert(session)) === "inserted") {
    return { result: "created", session };
  }

  const winner = await input.store.findActive(input.learnerId);
  if (!winner) {
    throw new Error("active session conflict could not be resolved");
  }
  return { result: "already_active", session: winner };
}

export type MemorySessionStore = SessionStore & { sessions: Session[] };

export function createMemorySessionStore(): MemorySessionStore {
  const sessions: Session[] = [];
  return {
    sessions,
    async findActive(learner_id) {
      return (
        sessions.find(
          (session) =>
            session.learner_id === learner_id && session.state === "ACTIVE",
        ) ?? null
      );
    },
    async insert(session) {
      if (
        session.state === "ACTIVE" &&
        sessions.some(
          (row) => row.learner_id === session.learner_id && row.state === "ACTIVE",
        )
      ) {
        return "duplicate_active";
      }
      sessions.push(structuredClone(session));
      return "inserted";
    },
  };
}
