import { describe, expect, it } from "vitest";
import { validateImportQuestion } from "@/lib/content-validate";
import { selected1 } from "@/lib/fixtures/selected-1";
import { mapSourceSystem } from "@/lib/learner-topics";

describe("Phase 2 content validator", () => {
  it("accepts Selected 1 and maps CARDIO_PERFUSION to the learner topic", () => {
    const result = validateImportQuestion(selected1);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.question.question_id).toBe("W4-B015-P01-I017");
    expect(result.version.question_version_id).toBe(
      "M2-CLEANUP-SELECTED-0001",
    );
    expect(result.question.topic_id).toBe("cardiovascular-perfusion");
    expect(result.question.source_system).toBe("CARDIO_PERFUSION");
    expect(result.question.source_topic).toContain("acute-aortic-dissection");
    expect(result.version.correct_option_ids).toEqual([
      "M2-CLEANUP-SELECTED-0001-OPT-C",
    ]);
    expect(result.version.publication_status).toBe("STAGED");
    expect(result.version.valid).toBe(true);
    expect(result.version.complete).toBe(true);
  });

  it("rejects an unmapped source system instead of guessing", () => {
    const result = validateImportQuestion({
      ...selected1,
      system: "UNKNOWN_SYSTEM",
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.some((error) => /unmapped source system/i.test(error))).toBe(
      true,
    );
  });

  it("rejects when OPTIONS.is_correct disagrees with displayed_correct_answer", () => {
    const result = validateImportQuestion({
      ...selected1,
      displayed_correct_answer: "A",
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(
      result.errors.some((error) => /does not match displayed_correct_answer/i.test(error)),
    ).toBe(true);
  });

  it("rejects missing rationale", () => {
    const result = validateImportQuestion({
      ...selected1,
      rationales: {
        ...selected1.rationales,
        learner_core_rationale: "",
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(
      result.errors.some((error) => /learner_core_rationale is required/.test(error)),
    ).toBe(true);
  });

  it("rejects missing options", () => {
    const result = validateImportQuestion({
      ...selected1,
      options: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.some((error) => /options are required/.test(error))).toBe(
      true,
    );
  });

  it("maps the approved later-batch system RENAL_GU", () => {
    expect(mapSourceSystem("RENAL_GU")).toBe("renal-endocrine-metabolic");
  });
});
