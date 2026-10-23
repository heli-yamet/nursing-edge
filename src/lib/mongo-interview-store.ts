import { attempts, interviewDeliveries, sessions } from "@/lib/learner-collections";
import {
  precommitTeaching,
  teachingDecisions,
} from "@/lib/relationship-collections";
import {
  recordInterviewDelivery,
  selectReviewInterview,
  type InterviewDeliveryResult,
  type InterviewStore,
  type ReviewInterview,
} from "@/lib/review-interview";

/** Reads precommit_teaching and teaching_decisions. Imported candidate rows alone produce no Interview. */
export async function loadApprovedInterview(
  questionId: string,
  questionVersionId: string,
): Promise<ReviewInterview | null> {
  const rows = await (
    await precommitTeaching()
  )
    .find(
      { question_version: questionVersionId },
      {
        projection: {
          _id: 0,
          teaching_id: 1,
          teaching_revision: 1,
          permanent_item_id: 1,
          question_version: 1,
          primary_prompt: 1,
          learner_commitment_prompt: 1,
          precommit_feedback: 1,
          feedback_mode: 1,
          optional_second_prompt: 1,
          max_interactions: 1,
          display_phase: 1,
          status: 1,
        },
      },
    )
    .toArray();
  if (rows.length === 0) {
    return null;
  }
  const decisions = await (
    await teachingDecisions()
  )
    .find(
      { teaching_id: { $in: [...new Set(rows.map((row) => row.teaching_id))] } },
      { projection: { _id: 0, teaching_id: 1, teaching_revision: 1, state: 1 } },
    )
    .toArray();
  return selectReviewInterview({ questionId, questionVersionId, rows, decisions });
}

export async function createMongoInterviewStore(): Promise<InterviewStore> {
  const [sessionRows, attemptRows, deliveryRows] = await Promise.all([
    sessions(),
    attempts(),
    interviewDeliveries(),
  ]);
  return {
    async findActive(learnerId) {
      return sessionRows.findOne(
        { learner_id: learnerId, state: "ACTIVE" },
        { projection: { _id: 0 } },
      );
    },
    async findAttempt(sessionId, position) {
      return attemptRows.findOne(
        { session_id: sessionId, position },
        { projection: { _id: 0 } },
      );
    },
    async committedPositions(sessionId) {
      const rows = await attemptRows
        .find({ session_id: sessionId }, { projection: { _id: 0, position: 1 } })
        .toArray();
      return rows.map((row) => row.position);
    },
    loadInterview: loadApprovedInterview,
    async deliveredSteps({ sessionId, position, teachingId, teachingRevision }) {
      const rows = await deliveryRows
        .find(
          {
            session_id: sessionId,
            position,
            teaching_id: teachingId,
            teaching_revision: teachingRevision,
          },
          { projection: { _id: 0, kind: 1, prompt_number: 1 } },
        )
        .toArray();
      return rows.map((row) =>
        row.kind === "PROMPT"
          ? { kind: "PROMPT" as const, prompt_number: row.prompt_number ?? 0 }
          : { kind: "METHOD_FEEDBACK" as const },
      );
    },
    async saveDelivery(delivery) {
      const { delivery_id, delivered_at, learner_id, question_id, ...key } = delivery;
      try {
        const result = await deliveryRows.updateOne(
          key,
          { $setOnInsert: { delivery_id, delivered_at, learner_id, question_id } },
          { upsert: true },
        );
        return result.upsertedCount === 1 ? "inserted" : "duplicate";
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
          return "duplicate";
        }
        throw error;
      }
    },
  };
}

export async function recordLearnerInterviewDelivery(input: {
  learnerId: string;
  position: unknown;
  questionVersionId: unknown;
  teachingId: unknown;
  teachingRevision: unknown;
  kind: unknown;
  promptNumber: unknown;
}): Promise<InterviewDeliveryResult> {
  return recordInterviewDelivery({ ...input, store: await createMongoInterviewStore() });
}
