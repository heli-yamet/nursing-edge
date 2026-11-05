import {
  formatAccessSummary,
  formatCalibrationSummary,
  reviewKindLabel,
  STAGE_LABELS,
  CYCLE_STATE_LABELS,
  DEFERRED_REASON_LABELS,
  reviewEffectLabel,
} from "@/lib/learner-admin-present";
import {
  attempts,
  calibrations,
  entitlements,
  interviewDeliveries,
  learners,
  questionVersions,
  questions,
  reviewCycles,
  reviewTransitions,
  sessions,
} from "@/lib/learner-collections";
import { normalizeLearnerEmail } from "@/lib/learner-access";
import type {
  Attempt,
  Calibration,
  Entitlement,
  Learner,
  ReviewCycle,
  ReviewTransition,
  Session,
} from "@/lib/learner-types";
import {
  buildLearnerTimeline,
  mapInterviewDeliveries,
  type TimelineEntry,
} from "@/lib/learner-timeline";

export type LearnerSearchResult =
  | { ok: true; learner: LearnerSummary }
  | { ok: false; reason: string };

export type LearnerSummary = {
  learner_id: string;
  email: string;
  first_name: string;
  created_at: string;
  access_summary: string;
  calibration_summary: string;
  activity: {
    practice_sessions: number;
    review_sessions: number;
    calibration_sessions: number;
    committed_attempts: number;
    active_review_cycles: number;
    completed_review_cycles: number;
  };
  timeline: TimelineEntry[];
};

export type ReviewTraceResult =
  | { ok: true; trace: ReviewTracePayload }
  | { ok: false; reason: string };

export type ReviewTracePayload = {
  cycle_id: string;
  question_id: string;
  stage: string;
  state: string;
  due_at: string;
  active_window_expires_at: string;
  paused_duration_ms: number;
  paused_at: string | null;
  rule_set_version: string;
  triggering_attempt_id: string;
  triggering_six_state: string;
  closure_reason: string | null;
  source_attempt: {
    attempt_id: string;
    committed_at: string;
    six_state: string;
    session_type: string;
  } | null;
  transitions: {
    transition_id: string;
    attempt_id: string;
    occurred_at: string;
    from_stage: string | null;
    to_stage: string | null;
    reason: string;
    effect: string | null;
  }[];
  sessions: ReviewTraceSession[];
};

export type ReviewTraceSession = {
  session_id: string;
  created_at: string;
  state: string;
  order_seed: string | null;
  assignments: {
    position: number;
    question_version_id: string;
    review_kind: string | null;
    kind_label: string;
    cycle_id: string | null;
    owner_question_id: string | null;
    matches_trace_cycle: boolean;
  }[];
  deferred_owners: {
    cycle_id: string;
    question_id: string;
    stage: string;
    due_at: string;
    reason: string;
    reason_label: string;
  }[];
};

export async function findLearnerByEmail(email: string): Promise<Learner | null> {
  const normalized = normalizeLearnerEmail(email);
  if (!normalized) {
    return null;
  }
  return (await learners()).findOne(
    { email: normalized },
    { projection: { _id: 0 } },
  );
}

export async function loadLearnerAdminProfile(
  learnerId: string,
): Promise<LearnerSearchResult> {
  const learner = await (await learners()).findOne(
    { learner_id: learnerId },
    { projection: { _id: 0, password_hash: 0 } },
  );
  if (!learner) {
    return { ok: false, reason: "No learner matches that id." };
  }

  const [
    entitlementRows,
    calibrationRow,
    sessionRows,
    attemptRows,
    cycleRows,
    deliveryRows,
  ] = await Promise.all([
    (await entitlements())
      .find(
        { learner_id: learnerId },
        { projection: { _id: 0, source: 1, status: 1 } },
      )
      .toArray(),
    (await calibrations()).findOne(
      { learner_id: learnerId },
      { projection: { _id: 0 } },
    ),
    (await sessions())
      .find({ learner_id: learnerId }, { projection: { _id: 0 } })
      .toArray(),
    (await attempts())
      .find({ learner_id: learnerId }, { projection: { _id: 0 } })
      .sort({ committed_at: 1 })
      .toArray(),
    (await reviewCycles())
      .find({ learner_id: learnerId }, { projection: { _id: 0 } })
      .toArray(),
    (await interviewDeliveries())
      .find({ learner_id: learnerId }, { projection: { _id: 0 } })
      .toArray(),
  ]);

  const cycleIds = cycleRows.map((cycle) => cycle.cycle_id);
  const allTransitions =
    cycleIds.length === 0
      ? []
      : await (
          await reviewTransitions()
        )
          .find({ cycle_id: { $in: cycleIds } }, { projection: { _id: 0 } })
          .toArray();

  const versionIds = [
    ...new Set(attemptRows.map((row) => row.question_version_id)),
  ];
  for (const session of sessionRows) {
    for (const row of session.assigned_versions) {
      versionIds.push(row.question_version_id);
    }
  }
  const uniqueVersionIds = [...new Set(versionIds)];
  const [versionRows, questionRows] = await Promise.all([
    uniqueVersionIds.length === 0
      ? []
      : (await questionVersions())
          .find(
            { question_version_id: { $in: uniqueVersionIds } },
            {
              projection: {
                _id: 0,
                question_version_id: 1,
                question_id: 1,
                stem: 1,
              },
            },
          )
          .toArray(),
    uniqueVersionIds.length === 0
      ? []
      : (await questions())
          .find(
            {
              question_id: {
                $in: [
                  ...new Set(
                    attemptRows.map((row) => row.question_id).concat(
                      sessionRows.flatMap((session) =>
                        session.assigned_versions.map((row) => row.question_id),
                      ),
                    ),
                  ),
                ],
              },
            },
            { projection: { _id: 0, question_id: 1, selected_number: 1 } },
          )
          .toArray(),
  ]);

  const questionById = new Map(
    questionRows.map((row) => [row.question_id, row.selected_number]),
  );
  const questionLabels = new Map<string, string>();
  for (const version of versionRows) {
    const number = questionById.get(version.question_id);
    const prefix =
      typeof number === "number" && number > 0
        ? `Question ${number}`
        : "Question";
    const stem = version.stem?.trim().replace(/\s+/g, " ") ?? "";
    const snippet =
      stem.length > 72 ? `${stem.slice(0, 69).trimEnd()}…` : stem;
    questionLabels.set(
      version.question_version_id,
      snippet ? `${prefix}: ${snippet}` : prefix,
    );
  }

  const sessionTypes = new Map(
    sessionRows.map((session) => [session.session_id, session.type]),
  );
  const transitionsByAttempt = groupTransitionsByAttempt(allTransitions);
  const cycleByAttempt = mapCycleByAttempt(allTransitions);
  const interviewsByAttemptKey = mapInterviewDeliveries(deliveryRows);
  const supportSkips = collectSupportSkips(sessionRows, questionLabels);

  const timeline = buildLearnerTimeline({
    attempts: attemptRows,
    transitionsByAttempt,
    questionLabels,
    sessionTypes,
    cycleByAttempt,
    interviewsByAttemptKey,
    supportSkips,
  });

  return {
    ok: true,
    learner: {
      learner_id: learner.learner_id,
      email: learner.email,
      first_name: learner.first_name,
      created_at: learner.created_at.toISOString(),
      access_summary: summarizeAccess(learner, entitlementRows),
      calibration_summary: summarizeCalibration(calibrationRow),
      activity: summarizeActivity(sessionRows, attemptRows, cycleRows),
      timeline,
    },
  };
}

export async function loadReviewTrace(input: {
  learnerId: string;
  cycleId: string;
}): Promise<ReviewTraceResult> {
  const cycle = await (await reviewCycles()).findOne(
    { cycle_id: input.cycleId, learner_id: input.learnerId },
    { projection: { _id: 0 } },
  );
  if (!cycle) {
    return { ok: false, reason: "That Review cycle was not found." };
  }

  const [transitions, sourceAttempt, sessionRows] = await Promise.all([
    (await reviewTransitions())
      .find({ cycle_id: cycle.cycle_id }, { projection: { _id: 0 } })
      .sort({ occurred_at: 1 })
      .toArray(),
    (await attempts()).findOne(
      { attempt_id: cycle.triggering_attempt_id },
      { projection: { _id: 0 } },
    ),
    (await sessions())
      .find(
        {
          learner_id: input.learnerId,
          type: "REVIEW",
          "assigned_versions.cycle_id": cycle.cycle_id,
        },
        { projection: { _id: 0 } },
      )
      .sort({ created_at: 1 })
      .toArray(),
  ]);

  let sourceSessionType = "Practice";
  if (sourceAttempt) {
    const sourceSession = await (await sessions()).findOne(
      { session_id: sourceAttempt.session_id },
      { projection: { _id: 0, type: 1 } },
    );
    if (sourceSession) {
      sourceSessionType = sourceSession.type;
    }
  }

  return {
    ok: true,
    trace: {
      cycle_id: cycle.cycle_id,
      question_id: cycle.question_id,
      stage: STAGE_LABELS[cycle.stage],
      state: CYCLE_STATE_LABELS[cycle.state],
      due_at: cycle.due_at.toISOString(),
      active_window_expires_at: cycle.active_window_expires_at.toISOString(),
      paused_duration_ms: cycle.paused_duration_ms,
      paused_at: cycle.paused_at ? cycle.paused_at.toISOString() : null,
      rule_set_version: cycle.rule_set_version,
      triggering_attempt_id: cycle.triggering_attempt_id,
      triggering_six_state: cycle.triggering_six_state,
      closure_reason: cycle.closure_reason,
      source_attempt: sourceAttempt
        ? {
            attempt_id: sourceAttempt.attempt_id,
            committed_at: sourceAttempt.committed_at.toISOString(),
            six_state: sourceAttempt.six_state,
            session_type: sourceSessionType,
          }
        : null,
      transitions: transitions.map((row) => ({
        transition_id: row.transition_id,
        attempt_id: row.attempt_id,
        occurred_at: row.occurred_at.toISOString(),
        from_stage: row.from_stage ? STAGE_LABELS[row.from_stage] : null,
        to_stage: row.to_stage ? STAGE_LABELS[row.to_stage] : null,
        reason: row.reason,
        effect: reviewEffectLabel(row),
      })),
      sessions: sessionRows.map((session) =>
        traceSessionPayload(session, cycle.cycle_id),
      ),
    },
  };
}

function traceSessionPayload(session: Session, cycleId: string): ReviewTraceSession {
  return {
    session_id: session.session_id,
    created_at: session.created_at.toISOString(),
    state: session.state,
    order_seed: session.order_seed ?? null,
    assignments: session.assigned_versions.map((row) => ({
      position: row.position,
      question_version_id: row.question_version_id,
      review_kind: row.review_kind ?? null,
      kind_label: row.review_kind ? reviewKindLabel(row.review_kind) : "Question",
      cycle_id: row.cycle_id ?? null,
      owner_question_id: row.owner_question_id ?? null,
      matches_trace_cycle: row.cycle_id === cycleId,
    })),
    deferred_owners: (session.review_deferred_owners ?? []).map((row) => ({
      cycle_id: row.cycle_id,
      question_id: row.question_id,
      stage: STAGE_LABELS[row.stage],
      due_at: row.due_at.toISOString(),
      reason: row.reason,
      reason_label: DEFERRED_REASON_LABELS[row.reason],
    })),
  };
}

function summarizeAccess(learner: Learner, rows: Entitlement[]): string {
  const active = rows.filter((row) => row.status === "ACTIVE");
  const sources = [...new Set(active.map((row) => row.source))];
  return formatAccessSummary({
    registered: true,
    active_entitlement: active.length > 0,
    entitlement_sources: sources,
  });
}

function summarizeCalibration(row: Calibration | null): string {
  if (!row) {
    return formatCalibrationSummary("NOT_CHOSEN");
  }
  return formatCalibrationSummary(row.state);
}

function summarizeActivity(
  sessionRows: Session[],
  attemptRows: Attempt[],
  cycleRows: ReviewCycle[],
) {
  return {
    practice_sessions: sessionRows.filter((row) => row.type === "PRACTICE").length,
    review_sessions: sessionRows.filter((row) => row.type === "REVIEW").length,
    calibration_sessions: sessionRows.filter((row) => row.type === "CALIBRATION")
      .length,
    committed_attempts: attemptRows.length,
    active_review_cycles: cycleRows.filter((row) => row.state === "ACTIVE").length,
    completed_review_cycles: cycleRows.filter((row) => row.state === "COMPLETE")
      .length,
  };
}

function groupTransitionsByAttempt(
  rows: ReviewTransition[],
): Map<string, ReviewTransition[]> {
  const grouped = new Map<string, ReviewTransition[]>();
  for (const row of rows) {
    const list = grouped.get(row.attempt_id) ?? [];
    list.push(row);
    grouped.set(row.attempt_id, list);
  }
  return grouped;
}

function mapCycleByAttempt(rows: ReviewTransition[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.reason === "commit") {
      map.set(row.attempt_id, row.cycle_id);
    }
  }
  for (const row of rows) {
    if (row.from_stage === null && row.to_stage !== null) {
      map.set(row.attempt_id, row.cycle_id);
    }
  }
  for (const row of rows) {
    if (!map.has(row.attempt_id)) {
      map.set(row.attempt_id, row.cycle_id);
    }
  }
  return map;
}

function collectSupportSkips(
  sessionRows: Session[],
  questionLabels: ReadonlyMap<string, string>,
): Omit<
  import("@/lib/learner-timeline").TimelineSupportSkipEntry,
  "kind" | "summary"
>[] {
  const skips: Omit<
    import("@/lib/learner-timeline").TimelineSupportSkipEntry,
    "kind" | "summary"
  >[] = [];
  for (const session of sessionRows) {
    if (session.type !== "REVIEW" || !session.skipped_positions?.length) {
      continue;
    }
    const skipped = new Set(session.skipped_positions);
    for (const assignment of session.assigned_versions) {
      if (!skipped.has(assignment.position) || assignment.review_kind !== "support") {
        continue;
      }
      skips.push({
        at: session.created_at.toISOString(),
        session_id: session.session_id,
        position: assignment.position,
        question_id: assignment.question_id,
        question_version_id: assignment.question_version_id,
        question_label:
          questionLabels.get(assignment.question_version_id) ??
          assignment.question_version_id,
        cycle_id: assignment.cycle_id ?? null,
      });
    }
  }
  return skips;
}

export async function searchLearnerByEmail(
  email: string,
): Promise<LearnerSearchResult> {
  const normalized = normalizeLearnerEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, reason: "Enter a valid email." };
  }
  const learner = await findLearnerByEmail(normalized);
  if (!learner) {
    return { ok: false, reason: "No learner account uses that email." };
  }
  return loadLearnerAdminProfile(learner.learner_id);
}
