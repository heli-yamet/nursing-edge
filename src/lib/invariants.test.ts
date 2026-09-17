import { describe, expect, it } from "vitest";
import { createFakeClock } from "@/lib/clock";
import { createLearnerId, emailIsNotLearnerId, assertAttemptUnchanged } from "@/lib/evidence-rules";
import * as learnerCollections from "@/lib/learner-collections";
import type { Attempt, AssignedVersion } from "@/lib/learner-types";
import {
  advanceReviewStage,
  canOpenReviewCycle,
  isAllowedConfidence,
  isReviewItemDue,
  reviewEntryForCommit,
  reviewSuccess,
  sixStateOf,
} from "@/lib/review-rules";
import {
  canStartQuestionSession,
  sessionQuestionsAreUnique,
} from "@/lib/session-rules";

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    attempt_id: "a1",
    learner_id: "learner-1",
    session_id: "session-1",
    question_version_id: "qv-1",
    selected_option_ids: ["o1"],
    confidence: "SURE",
    correct: true,
    six_state: "CORRECT_SURE",
    sequence: 1,
    committed_at: new Date("2026-09-15T09:00:00Z"),
    rule_set_version: "5.1",
    ...overrides,
  };
}

describe("Phase 1 invariants", () => {
  it("1. allows only one active session across Practice and Review", () => {
    expect(canStartQuestionSession([])).toBe(true);
    expect(
      canStartQuestionSession([{ state: "COMPLETED", type: "PRACTICE" }]),
    ).toBe(true);
    expect(
      canStartQuestionSession([{ state: "ACTIVE", type: "PRACTICE" }]),
    ).toBe(false);
    expect(
      canStartQuestionSession([{ state: "ACTIVE", type: "REVIEW" }]),
    ).toBe(false);
  });

  it("2. accepts only Unsure, Sure, and Confident", () => {
    expect(isAllowedConfidence("UNSURE")).toBe(true);
    expect(isAllowedConfidence("SURE")).toBe(true);
    expect(isAllowedConfidence("CONFIDENT")).toBe(true);
    expect(isAllowedConfidence("very sure")).toBe(false);
    expect(isAllowedConfidence("")).toBe(false);
    expect(() =>
      reviewEntryForCommit(true, "very sure" as Attempt["confidence"], new Date()),
    ).toThrow(/confidence/i);
  });

  it("3. rejects edits to a committed attempt", () => {
    const committed = attempt();
    expect(() =>
      assertAttemptUnchanged(committed, attempt({ confidence: "CONFIDENT" })),
    ).toThrow(/immutable/i);
    expect(() => assertAttemptUnchanged(committed, attempt())).not.toThrow();
    expect(learnerCollections).not.toHaveProperty("updateAttempt");
    expect(typeof learnerCollections.insertAttempt).toBe("function");
  });

  it("4. never uses email as learner_id", () => {
    const email = "learner@example.com";
    const learner_id = createLearnerId();
    expect(emailIsNotLearnerId(learner_id, email)).toBe(true);
    expect(emailIsNotLearnerId(email, email)).toBe(false);
    expect(learner_id).not.toContain("@");
  });

  it("5. allows only one active Review cycle per learner-question", () => {
    expect(canOpenReviewCycle(false)).toBe(true);
    expect(canOpenReviewCycle(true)).toBe(false);
  });

  it("6. maps six-state commits to Review entry", () => {
    const clock = createFakeClock(new Date("2026-09-15T09:00:00Z"));
    const committedAt = clock.now();

    expect(reviewEntryForCommit(true, "CONFIDENT", committedAt)).toBeNull();
    expect(sixStateOf(true, "CONFIDENT")).toBe("CORRECT_CONFIDENT");

    const confirmation = reviewEntryForCommit(true, "SURE", committedAt);
    expect(confirmation?.stage).toBe("CONFIRMATION");
    clock.advanceHours(72);
    expect(confirmation?.due_at.getTime()).toBe(clock.now().getTime());

    const repairUnsure = reviewEntryForCommit(true, "UNSURE", committedAt);
    expect(repairUnsure?.stage).toBe("REPAIR");
    expect(repairUnsure?.due_at.getTime()).toBe(
      committedAt.getTime() + 24 * 60 * 60 * 1000,
    );

    for (const confidence of ["UNSURE", "SURE", "CONFIDENT"] as const) {
      const repair = reviewEntryForCommit(false, confidence, committedAt);
      expect(repair?.stage).toBe("REPAIR");
    }
  });

  it("7. sets active_window_expires_at to due_at plus 14 days", () => {
    const committedAt = new Date("2026-09-15T09:00:00Z");
    const entry = reviewEntryForCommit(true, "SURE", committedAt);
    expect(entry).not.toBeNull();
    expect(entry?.active_window_expires_at.getTime()).toBe(
      entry!.due_at.getTime() + 14 * 24 * 60 * 60 * 1000,
    );

    const clock = createFakeClock(entry!.due_at);
    expect(
      isReviewItemDue(clock.now(), entry!.due_at, entry!.active_window_expires_at),
    ).toBe(true);
    clock.advanceHours(14 * 24);
    expect(
      isReviewItemDue(clock.now(), entry!.due_at, entry!.active_window_expires_at),
    ).toBe(false);
  });

  it("8. advances Review only on Correct + Sure or Correct + Confident", () => {
    const committedAt = new Date("2026-09-16T09:00:00Z");

    expect(reviewSuccess(true, "SURE")).toBe(true);
    expect(reviewSuccess(true, "CONFIDENT")).toBe(true);
    expect(reviewSuccess(true, "UNSURE")).toBe(false);
    expect(reviewSuccess(false, "CONFIDENT")).toBe(false);

    const fromRepair = advanceReviewStage("REPAIR", true, "UNSURE", committedAt);
    expect(fromRepair).toMatchObject({ kind: "continue", stage: "REPAIR" });

    const repairSuccess = advanceReviewStage(
      "REPAIR",
      true,
      "SURE",
      committedAt,
    );
    expect(repairSuccess).toMatchObject({
      kind: "continue",
      stage: "CONFIRMATION",
    });

    const confirmationSuccess = advanceReviewStage(
      "CONFIRMATION",
      true,
      "CONFIDENT",
      committedAt,
    );
    expect(confirmationSuccess).toEqual({ kind: "complete" });

    const confirmationFail = advanceReviewStage(
      "CONFIRMATION",
      true,
      "UNSURE",
      committedAt,
    );
    expect(confirmationFail).toMatchObject({ kind: "continue", stage: "REPAIR" });
  });

  it("9. forbids duplicate questions inside a session", () => {
    const unique: AssignedVersion[] = [
      { position: 1, question_id: "q1", question_version_id: "qv1" },
      { position: 2, question_id: "q2", question_version_id: "qv2" },
    ];
    const duplicated: AssignedVersion[] = [
      ...unique,
      { position: 3, question_id: "q1", question_version_id: "qv1b" },
    ];
    expect(sessionQuestionsAreUnique(unique)).toBe(true);
    expect(sessionQuestionsAreUnique(duplicated)).toBe(false);
  });
});
