import {
  assembleAuditEntries,
  buildLearnerEvidenceExport,
  filterAuditEntries,
  type AuditEntry,
  type AuditFilters,
  type ExportAttemptRecord,
  type LearnerEvidenceExport,
} from "@/lib/admin-audit";
import { newPermanentId } from "@/lib/ids";
import type { LinkDecision } from "@/lib/link-decisions";
import {
  accessGrantAudits,
  attempts,
  deleteAudits,
  exportAudits,
  importBatches,
  interviewDeliveries,
  learners,
  pauseAudits,
  publishAudits,
  reviewCycles,
} from "@/lib/learner-collections";
import type { ExportAudit, ReviewCycle } from "@/lib/learner-types";
import { getDb } from "@/lib/mongo";
import type { InterviewDelivery, TeachingDecision } from "@/lib/review-interview";

export async function loadAdminAudit(
  filters: AuditFilters,
): Promise<{ entries: AuditEntry[]; matched: number }> {
  const db = await getDb();
  const [
    admins,
    publishes,
    pauses,
    deletes,
    grants,
    imports,
    links,
    teachings,
    exports,
  ] = await Promise.all([
    db
      .collection<{ admin_id: string; email: string }>("admin_users")
      .find({}, { projection: { _id: 0, admin_id: 1, email: 1 } })
      .toArray(),
    (await publishAudits()).find({}, { projection: { _id: 0 } }).toArray(),
    (await pauseAudits()).find({}, { projection: { _id: 0 } }).toArray(),
    (await deleteAudits()).find({}, { projection: { _id: 0 } }).toArray(),
    (await accessGrantAudits()).find({}, { projection: { _id: 0 } }).toArray(),
    (await importBatches()).find({}, { projection: { _id: 0 } }).toArray(),
    db
      .collection<LinkDecision>("link_decisions")
      .find({}, { projection: { _id: 0 } })
      .toArray(),
    db
      .collection<TeachingDecision>("teaching_decisions")
      .find({}, { projection: { _id: 0 } })
      .toArray(),
    (await exportAudits()).find({}, { projection: { _id: 0 } }).toArray(),
  ]);

  const entries = filterAuditEntries(
    assembleAuditEntries({
      admins,
      publishes,
      pauses,
      deletes,
      accessGrants: grants,
      imports,
      linkDecisions: links,
      teachingDecisions: teachings,
      exports,
    }),
    filters,
  );
  return { entries, matched: entries.length };
}

export async function exportLearnerEvidence(input: {
  actorAdminId: string;
  learnerId: string;
  now: Date;
}): Promise<
  | { ok: true; body: LearnerEvidenceExport }
  | { ok: false; reason: string }
> {
  const learnerId = input.learnerId.trim();
  const learner = await (await learners()).findOne(
    { learner_id: learnerId },
    { projection: { _id: 0, learner_id: 1 } },
  );
  if (!learner) {
    await insertExportAudit({
      actorAdminId: input.actorAdminId,
      learnerId,
      now: input.now,
      outcome: "REJECTED",
      reason: "No learner with that id.",
    });
    return { ok: false, reason: "No learner with that id." };
  }

  const [attemptRows, cycles, deliveries] = await Promise.all([
    (await attempts())
      .find(
        { learner_id: learnerId },
        {
          projection: {
            _id: 0,
            attempt_id: 1,
            question_id: 1,
            question_version_id: 1,
            session_id: 1,
            correct: 1,
            confidence: 1,
            six_state: 1,
            committed_at: 1,
          },
        },
      )
      .toArray(),
    (await reviewCycles())
      .find({ learner_id: learnerId }, { projection: { _id: 0 } })
      .toArray(),
    (await interviewDeliveries())
      .find({ learner_id: learnerId }, { projection: { _id: 0 } })
      .toArray(),
  ]);

  const body = buildLearnerEvidenceExport({
    learnerId,
    exportedAt: input.now,
    attempts: attemptRows as ExportAttemptRecord[],
    cycles: cycles as ReviewCycle[],
    deliveries: deliveries as InterviewDelivery[],
  });
  await insertExportAudit({
    actorAdminId: input.actorAdminId,
    learnerId,
    now: input.now,
    outcome: "EXPORTED",
    reason: null,
  });
  return { ok: true, body };
}

async function insertExportAudit(input: {
  actorAdminId: string;
  learnerId: string;
  now: Date;
  outcome: ExportAudit["outcome"];
  reason: string | null;
}): Promise<void> {
  const audit: ExportAudit = {
    audit_id: newPermanentId(),
    actor_admin_id: input.actorAdminId,
    learner_id: input.learnerId,
    occurred_at: input.now,
    outcome: input.outcome,
    reason: input.reason,
  };
  await (await exportAudits()).insertOne(audit);
}
