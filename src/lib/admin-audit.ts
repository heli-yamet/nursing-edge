import type { LinkDecision } from "@/lib/link-decisions";
import type {
  AccessGrantAudit,
  DeleteAudit,
  ExportAudit,
  ImportBatch,
  PauseAudit,
  PublishAudit,
  ReviewCycle,
} from "@/lib/learner-types";
import { parseIsoDate } from "@/lib/learning-evidence";
import type {
  InterviewDelivery,
  TeachingDecision,
} from "@/lib/review-interview";

export const AUDIT_ACTIONS = [
  "publish",
  "pause",
  "delete",
  "access_grant",
  "import",
  "link_decision",
  "teaching_decision",
  "export",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_OUTCOMES = [
  "PUBLISHED",
  "PAUSED",
  "RESUMED",
  "DELETED",
  "REJECTED",
  "GRANTED",
  "PASSED",
  "PARTIAL",
  "FAILED",
  "approved",
  "banned",
  "EXPORTED",
] as const;

export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export type AuditEntry = {
  entry_id: string;
  occurred_at: string;
  actor_admin_id: string | null;
  actor_label: string;
  action: AuditAction;
  outcome: AuditOutcome;
  detail: string;
};

export type AuditFilters = {
  actor: string | null;
  from: Date | null;
  to: Date | null;
  action: AuditAction | "ALL";
  outcome: AuditOutcome | "ALL";
};

export type AuditAdmin = {
  admin_id: string;
  email: string;
};

export type AuditSourceRecords = {
  admins: AuditAdmin[];
  publishes: PublishAudit[];
  pauses: PauseAudit[];
  deletes: DeleteAudit[];
  accessGrants: AccessGrantAudit[];
  imports: ImportBatch[];
  linkDecisions: LinkDecision[];
  teachingDecisions: TeachingDecision[];
  exports: ExportAudit[];
};

export type ExportAttemptRecord = {
  attempt_id: string;
  question_id: string;
  question_version_id: string;
  session_id: string;
  correct: boolean;
  confidence: string;
  six_state: string;
  committed_at: Date;
};

export type LearnerEvidenceExport = {
  learner_id: string;
  exported_at: string;
  attempts: {
    attempt_id: string;
    question_id: string;
    question_version_id: string;
    session_id: string;
    correct: boolean;
    confidence: string;
    six_state: string;
    committed_at: string;
  }[];
  review_cycles: {
    cycle_id: string;
    question_id: string;
    stage: string;
    state: string;
    due_at: string;
    active_window_expires_at: string;
    triggering_attempt_id: string;
    triggering_six_state: string;
    closure_reason: string | null;
    rule_set_version: string;
  }[];
  interview_deliveries: {
    delivery_id: string;
    session_id: string;
    question_id: string;
    question_version_id: string;
    teaching_id: string;
    teaching_revision: number;
    kind: string;
    prompt_number: number | null;
    delivered_at: string;
  }[];
};

const NOT_RECORDED = "Not recorded";

export function isOperatorRole(role: string): boolean {
  return role === "SUPER_ADMIN";
}

export function importBatchOutcome(
  batch: Pick<ImportBatch, "passed_count" | "failed_count" | "unchanged_count">,
): "PASSED" | "FAILED" | "PARTIAL" {
  if (batch.failed_count === 0) {
    return "PASSED";
  }
  if (batch.passed_count === 0 && batch.unchanged_count === 0) {
    return "FAILED";
  }
  return "PARTIAL";
}

export function learnerExportFilename(learnerId: string): string {
  const safe = learnerId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return `learner-${safe || "export"}.json`;
}

/**
 * One list from the stored admin actions. Imported teaching with no decision
 * is absent. This function does not write attempts, cycles, or answer keys.
 */
export function assembleAuditEntries(sources: AuditSourceRecords): AuditEntry[] {
  const emails = new Map<string, string>();
  for (const admin of sources.admins) {
    if (admin.admin_id && admin.email) {
      emails.set(admin.admin_id, admin.email);
    }
  }

  const entries: AuditEntry[] = [];

  for (const row of sources.publishes) {
    entries.push(
      versionEntry(emails, "publish", row.audit_id, row.actor_admin_id, row.occurred_at, row.outcome, row.question_version_ids, row.reason),
    );
  }
  for (const row of sources.pauses) {
    entries.push(
      versionEntry(emails, "pause", row.audit_id, row.actor_admin_id, row.occurred_at, row.outcome, row.question_version_ids, row.reason),
    );
  }
  for (const row of sources.deletes) {
    entries.push(
      versionEntry(emails, "delete", row.audit_id, row.actor_admin_id, row.occurred_at, row.outcome, row.question_version_ids, row.reason),
    );
  }
  for (const row of sources.accessGrants) {
    const reason = row.reason ? ` — ${row.reason}` : "";
    entries.push({
      entry_id: row.audit_id,
      occurred_at: toIso(row.occurred_at),
      ...actorFields(emails, row.actor_admin_id),
      action: "access_grant",
      outcome: row.outcome,
      detail: `${row.email}${reason}`,
    });
  }
  for (const batch of sources.imports) {
    entries.push({
      entry_id: batch.batch_id,
      occurred_at: toIso(batch.created_at),
      actor_admin_id: null,
      actor_label: NOT_RECORDED,
      action: "import",
      outcome: importBatchOutcome(batch),
      detail: `${batch.source}: ${batch.passed_count} passed, ${batch.failed_count} failed, ${batch.unchanged_count} unchanged`,
    });
  }
  for (const decision of sources.linkDecisions) {
    if (decision.state !== "approved" && decision.state !== "banned") {
      continue;
    }
    entries.push({
      entry_id: `link:${decision.link_kind}:${decision.link_id}:${decision.link_revision}`,
      occurred_at: toIso(decision.acted_at),
      ...actorFields(emails, decision.admin_id),
      action: "link_decision",
      outcome: decision.state,
      detail: `${decision.link_kind} ${decision.link_id} revision ${decision.link_revision}`,
    });
  }
  for (const decision of sources.teachingDecisions) {
    if (decision.state !== "approved" && decision.state !== "banned") {
      continue;
    }
    entries.push({
      entry_id: `teaching:${decision.teaching_id}:${decision.teaching_revision}`,
      occurred_at: toIso(decision.acted_at),
      ...actorFields(emails, decision.admin_id),
      action: "teaching_decision",
      outcome: decision.state,
      detail: `${decision.teaching_id} revision ${decision.teaching_revision}`,
    });
  }
  for (const row of sources.exports) {
    const reason = row.reason ? ` — ${row.reason}` : "";
    entries.push({
      entry_id: row.audit_id,
      occurred_at: toIso(row.occurred_at),
      ...actorFields(emails, row.actor_admin_id),
      action: "export",
      outcome: row.outcome,
      detail: `${row.learner_id}${reason}`,
    });
  }

  entries.sort((left, right) => {
    const time = right.occurred_at.localeCompare(left.occurred_at);
    if (time !== 0) {
      return time;
    }
    return left.entry_id.localeCompare(right.entry_id);
  });
  return entries;
}

export function filterAuditEntries(
  entries: readonly AuditEntry[],
  filters: AuditFilters,
): AuditEntry[] {
  const actor = filters.actor?.trim().toLowerCase() ?? "";
  return entries.filter((entry) => {
    if (filters.action !== "ALL" && entry.action !== filters.action) {
      return false;
    }
    if (filters.outcome !== "ALL" && entry.outcome !== filters.outcome) {
      return false;
    }
    const at = new Date(entry.occurred_at);
    if (filters.from && at < filters.from) {
      return false;
    }
    if (filters.to && at > filters.to) {
      return false;
    }
    if (actor === "") {
      return true;
    }
    const label = entry.actor_label.toLowerCase();
    const id = (entry.actor_admin_id ?? "").toLowerCase();
    return label.includes(actor) || id.includes(actor);
  });
}

export function parseAuditFilters(
  params: URLSearchParams,
): { ok: true; filters: AuditFilters } | { ok: false; reason: string } {
  const from = parseIsoDate(params.get("from"));
  const to = parseIsoDate(params.get("to"));
  if (params.get("from") && from === null) {
    return { ok: false, reason: "from must be a valid ISO date." };
  }
  if (params.get("to") && to === null) {
    return { ok: false, reason: "to must be a valid ISO date." };
  }

  const actionRaw = params.get("action")?.trim() || "ALL";
  if (actionRaw !== "ALL" && !AUDIT_ACTIONS.includes(actionRaw as AuditAction)) {
    return { ok: false, reason: "action is not valid." };
  }

  const outcomeRaw = params.get("outcome")?.trim() || "ALL";
  if (
    outcomeRaw !== "ALL" &&
    !AUDIT_OUTCOMES.includes(outcomeRaw as AuditOutcome)
  ) {
    return { ok: false, reason: "outcome is not valid." };
  }

  const actor = params.get("actor")?.trim() ?? "";
  return {
    ok: true,
    filters: {
      actor: actor === "" ? null : actor,
      from,
      to,
      action: actionRaw as AuditAction | "ALL",
      outcome: outcomeRaw as AuditOutcome | "ALL",
    },
  };
}

/**
 * Pseudonymous export of learner-written records. Fields are copied by name.
 * Answer keys, stems, option ids, names, and emails are not included.
 */
export function buildLearnerEvidenceExport(input: {
  learnerId: string;
  exportedAt: Date;
  attempts: readonly ExportAttemptRecord[];
  cycles: readonly ReviewCycle[];
  deliveries: readonly InterviewDelivery[];
}): LearnerEvidenceExport {
  const attempts = [...input.attempts].sort((left, right) => {
    return (
      left.committed_at.getTime() - right.committed_at.getTime() ||
      left.attempt_id.localeCompare(right.attempt_id)
    );
  });
  const cycles = [...input.cycles].sort((left, right) =>
    left.cycle_id.localeCompare(right.cycle_id),
  );
  const deliveries = [...input.deliveries].sort((left, right) => {
    return (
      left.delivered_at.getTime() - right.delivered_at.getTime() ||
      left.delivery_id.localeCompare(right.delivery_id)
    );
  });

  return {
    learner_id: input.learnerId,
    exported_at: input.exportedAt.toISOString(),
    attempts: attempts.map((attempt) => ({
      attempt_id: attempt.attempt_id,
      question_id: attempt.question_id,
      question_version_id: attempt.question_version_id,
      session_id: attempt.session_id,
      correct: attempt.correct,
      confidence: attempt.confidence,
      six_state: attempt.six_state,
      committed_at: attempt.committed_at.toISOString(),
    })),
    review_cycles: cycles.map((cycle) => ({
      cycle_id: cycle.cycle_id,
      question_id: cycle.question_id,
      stage: cycle.stage,
      state: cycle.state,
      due_at: cycle.due_at.toISOString(),
      active_window_expires_at: cycle.active_window_expires_at.toISOString(),
      triggering_attempt_id: cycle.triggering_attempt_id,
      triggering_six_state: cycle.triggering_six_state,
      closure_reason: cycle.closure_reason,
      rule_set_version: cycle.rule_set_version,
    })),
    interview_deliveries: deliveries.map((delivery) => ({
      delivery_id: delivery.delivery_id,
      session_id: delivery.session_id,
      question_id: delivery.question_id,
      question_version_id: delivery.question_version_id,
      teaching_id: delivery.teaching_id,
      teaching_revision: delivery.teaching_revision,
      kind: delivery.kind,
      prompt_number: delivery.prompt_number,
      delivered_at: delivery.delivered_at.toISOString(),
    })),
  };
}

function versionEntry(
  emails: Map<string, string>,
  action: "publish" | "pause" | "delete",
  auditId: string,
  actorAdminId: string,
  occurredAt: Date,
  outcome: AuditOutcome,
  versionIds: string[],
  reason: string | null,
): AuditEntry {
  const shown = versionIds.slice(0, 3).join(", ");
  const extra = versionIds.length > 3 ? ` (+${versionIds.length - 3} more)` : "";
  const reasonText = reason ? ` — ${reason}` : "";
  const versions = shown === "" ? "No versions" : `${shown}${extra}`;
  return {
    entry_id: auditId,
    occurred_at: toIso(occurredAt),
    ...actorFields(emails, actorAdminId),
    action,
    outcome,
    detail: `${versions}${reasonText}`,
  };
}

function actorFields(
  emails: Map<string, string>,
  adminId: string | null,
): Pick<AuditEntry, "actor_admin_id" | "actor_label"> {
  if (!adminId) {
    return { actor_admin_id: null, actor_label: NOT_RECORDED };
  }
  return {
    actor_admin_id: adminId,
    actor_label: emails.get(adminId) ?? adminId,
  };
}

function toIso(value: Date): string {
  return value.toISOString();
}
