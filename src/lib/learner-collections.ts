import { getDb } from "@/lib/mongo";
import type {
  AccessGrantAudit,
  Attempt,
  Entitlement,
  Exposure,
  ImportBatch,
  ImportLine,
  PublishAudit,
  Learner,
  Question,
  QuestionVersion,
  ReviewCycle,
  ReviewTransition,
  Session,
} from "@/lib/learner-types";

export async function learners() {
  return (await getDb()).collection<Learner>("learners");
}

export async function entitlements() {
  return (await getDb()).collection<Entitlement>("entitlements");
}

export async function accessGrantAudits() {
  return (await getDb()).collection<AccessGrantAudit>("access_grant_audits");
}

export async function questions() {
  return (await getDb()).collection<Question>("questions");
}

export async function questionVersions() {
  return (await getDb()).collection<QuestionVersion>("question_versions");
}

export async function importBatches() {
  return (await getDb()).collection<ImportBatch>("import_batches");
}

export async function importLines() {
  return (await getDb()).collection<ImportLine>("import_lines");
}

export async function publishAudits() {
  return (await getDb()).collection<PublishAudit>("publish_audits");
}

export async function sessions() {
  return (await getDb()).collection<Session>("sessions");
}

export async function exposures() {
  return (await getDb()).collection<Exposure>("exposures");
}

export async function reviewCycles() {
  return (await getDb()).collection<ReviewCycle>("review_cycles");
}

export async function reviewTransitions() {
  return (await getDb()).collection<ReviewTransition>("review_transitions");
}

async function attempts() {
  return (await getDb()).collection<Attempt>("attempts");
}

export async function insertAttempt(attempt: Attempt): Promise<void> {
  await (await attempts()).insertOne(attempt);
}

export async function findAttemptById(
  attempt_id: string,
): Promise<Attempt | null> {
  return (await attempts()).findOne({ attempt_id });
}

export async function findAttemptsBySession(
  session_id: string,
): Promise<Attempt[]> {
  return (await attempts())
    .find({ session_id })
    .sort({ sequence: 1 })
    .toArray();
}
