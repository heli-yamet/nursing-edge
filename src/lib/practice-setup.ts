import { getActiveCalibrationBlueprint } from "@/lib/calibration-blueprint";
import {
  planCalibrationAssignment,
  practiceEntryView,
  readCalibrationState,
  type PracticeEntryView,
} from "@/lib/calibration-entry";
import {
  findAttemptsByLearner,
  questions,
  questionVersions,
} from "@/lib/learner-collections";
import type {
  CalibrationBlueprint,
  Question,
  QuestionVersion,
  Session,
} from "@/lib/learner-types";
import type { PracticeSupply } from "@/lib/practice-options";
import {
  lastAttemptByQuestion,
  practiceCandidates,
  practiceSupply,
  type PracticeCandidate,
} from "@/lib/practice-selection";
import {
  startBaselineSession,
  type StartBaselineResult,
} from "@/lib/calibration-session";
import { readLearnerAccess } from "@/lib/learner-access";
import {
  createMongoBaselineStore,
  createMongoSessionStore,
} from "@/lib/mongo-session-store";
import {
  startPracticeSession,
  type PracticePool,
  type StartSessionResult,
} from "@/lib/practice-session";

export type PracticeSetupData = {
  view: PracticeEntryView;
  supply: PracticeSupply;
};

type PracticeContent = {
  published: QuestionVersion[];
  blueprint: CalibrationBlueprint | null;
  candidates: PracticeCandidate[];
};

async function readPracticeContent(): Promise<PracticeContent> {
  const [published, questionRows, blueprint] = await Promise.all([
    (await questionVersions())
      .find({ publication_status: "PUBLISHED" }, { projection: { _id: 0 } })
      .toArray(),
    (await questions()).find({}, { projection: { _id: 0 } }).toArray(),
    getActiveCalibrationBlueprint(),
  ]);
  const questionMap = new Map<string, Question>(
    questionRows.map((question) => [question.question_id, question]),
  );
  const reserved = new Set(blueprint?.question_version_ids ?? []);
  return {
    published,
    blueprint,
    candidates: practiceCandidates(published, questionMap, reserved),
  };
}

export async function loadPracticeSetup(
  learnerId: string,
): Promise<PracticeSetupData> {
  const [content, calibrationState] = await Promise.all([
    readPracticeContent(),
    readCalibrationState(learnerId),
  ]);
  const versionMap = new Map<string, QuestionVersion>(
    content.published.map((version) => [version.question_version_id, version]),
  );

  return {
    view: practiceEntryView({
      calibrationState,
      baselineAvailable: planCalibrationAssignment(content.blueprint, versionMap)
        .ok,
    }),
    supply: practiceSupply(content.candidates),
  };
}

export async function loadPracticePool(learnerId: string): Promise<PracticePool> {
  const [content, attempts, allVersions] = await Promise.all([
    readPracticeContent(),
    findAttemptsByLearner(learnerId),
    (await questionVersions())
      .find({}, { projection: { _id: 0, question_version_id: 1, question_id: 1 } })
      .toArray(),
  ]);
  const versionToQuestion = new Map<string, string>(
    allVersions.map((version) => [version.question_version_id, version.question_id]),
  );
  return {
    candidates: content.candidates,
    lastAttemptedAt: lastAttemptByQuestion(attempts, versionToQuestion),
  };
}

export async function readActiveSession(learnerId: string): Promise<Session | null> {
  return (await createMongoSessionStore()).findActive(learnerId);
}

export async function startLearnerBaselineSession(
  learnerId: string,
): Promise<StartBaselineResult> {
  return startBaselineSession({
    learnerId,
    store: await createMongoBaselineStore(),
    hasAccess: () => readLearnerAccess(learnerId),
    loadPlan: async () => {
      const content = await readPracticeContent();
      const versionMap = new Map<string, QuestionVersion>(
        content.published.map((version) => [version.question_version_id, version]),
      );
      return {
        blueprint: content.blueprint,
        assignment: planCalibrationAssignment(content.blueprint, versionMap),
      };
    },
  });
}

export async function startLearnerPracticeSession(input: {
  learnerId: string;
  scope: unknown;
  size: unknown;
}): Promise<StartSessionResult> {
  return startPracticeSession({
    learnerId: input.learnerId,
    scope: input.scope,
    size: input.size,
    store: await createMongoSessionStore(),
    hasAccess: () => readLearnerAccess(input.learnerId),
    loadPool: () => loadPracticePool(input.learnerId),
  });
}
