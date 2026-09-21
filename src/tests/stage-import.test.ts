import { describe, expect, it } from "vitest";
import { createFakeClock } from "@/lib/clock";
import { createMemoryContentStore } from "@/lib/content-store";
import { validateImportQuestion } from "@/lib/content-validate";
import { selected1 } from "@/lib/fixtures/selected-1";
import {
  isLearnerEligible,
  planVersionWrite,
  stageImport,
} from "@/lib/stage-import";
import type { ImportQuestionInput } from "@/lib/content-validate";
import type { QuestionVersion } from "@/lib/learner-types";

function validVersion(): QuestionVersion {
  const result = validateImportQuestion(selected1);
  if (!result.ok) {
    throw new Error(result.errors.join("; "));
  }
  return result.version;
}

describe("Phase 3 staged import", () => {
  it("plans insert when the version is new", () => {
    expect(planVersionWrite(validVersion(), null, false).kind).toBe("insert");
  });

  it("plans unchanged when the fingerprint matches", () => {
    const version = validVersion();
    expect(planVersionWrite(version, version, false).kind).toBe("unchanged");
  });

  it("plans overwrite for a staged version with no attempts", () => {
    const existing = validVersion();
    const incoming = { ...existing, content_fingerprint: "changed" };
    expect(planVersionWrite(incoming, existing, false).kind).toBe("overwrite");
  });

  it("fails when a published version has different content", () => {
    const existing = { ...validVersion(), publication_status: "PUBLISHED" as const };
    const incoming = { ...existing, content_fingerprint: "changed" };
    const plan = planVersionWrite(incoming, existing, false);
    expect(plan.kind).toBe("fail");
  });

  it("fails when an attempted version has different content", () => {
    const existing = validVersion();
    const incoming = { ...existing, content_fingerprint: "changed" };
    const plan = planVersionWrite(incoming, existing, true);
    expect(plan.kind).toBe("fail");
  });

  it("stages Selected 1 without making it learner eligible", async () => {
    const store = createMemoryContentStore();
    const clock = createFakeClock(new Date("2026-09-18T14:00:00Z"));
    const result = await stageImport(
      store,
      { records: [selected1], source: "fixture" },
      clock,
    );

    expect(result.batch.line_count).toBe(1);
    expect(result.batch.passed_count).toBe(1);
    expect(result.batch.failed_count).toBe(0);
    expect(result.lines[0]?.outcome).toBe("PASSED");

    const version = store.versions.get("M2-CLEANUP-SELECTED-0001");
    expect(version?.publication_status).toBe("STAGED");
    expect(version).toBeDefined();
    if (!version) {
      return;
    }
    expect(isLearnerEligible(version)).toBe(false);
    expect(store.questions.get("W4-B015-P01-I017")?.question_id).toBe(
      "W4-B015-P01-I017",
    );
  });

  it("does not insert a second copy when the fingerprint matches", async () => {
    const store = createMemoryContentStore();
    await stageImport(store, { records: [selected1] });
    const again = await stageImport(store, { records: [selected1] });

    expect(again.lines[0]?.outcome).toBe("UNCHANGED");
    expect(store.versions.size).toBe(1);
    expect(store.questions.size).toBe(1);
  });

  it("overwrites a staged version when content changes", async () => {
    const store = createMemoryContentStore();
    await stageImport(store, { records: [selected1] });
    const edited: ImportQuestionInput = {
      ...selected1,
      stem: `${selected1.stem} Clarified.`,
    };
    const result = await stageImport(store, { records: [edited] });

    expect(result.lines[0]?.outcome).toBe("PASSED");
    const version = store.versions.get("M2-CLEANUP-SELECTED-0001");
    expect(version?.stem).toContain("Clarified.");
    expect(version?.publication_status).toBe("STAGED");
    expect(store.versions.size).toBe(1);
  });

  it("does not overwrite a published version with different content", async () => {
    const store = createMemoryContentStore();
    await stageImport(store, { records: [selected1] });
    const published = store.versions.get("M2-CLEANUP-SELECTED-0001");
    if (!published) {
      throw new Error("expected staged version");
    }
    store.versions.set(published.question_version_id, {
      ...published,
      publication_status: "PUBLISHED",
    });

    const edited: ImportQuestionInput = {
      ...selected1,
      stem: `${selected1.stem} Changed after publish.`,
    };
    const result = await stageImport(store, { records: [edited] });
    expect(result.lines[0]?.outcome).toBe("FAILED");
    expect(result.lines[0]?.errors[0]).toMatch(/frozen/i);
    expect(store.versions.get("M2-CLEANUP-SELECTED-0001")?.stem).toBe(
      selected1.stem,
    );
    expect(
      store.versions.get("M2-CLEANUP-SELECTED-0001")?.publication_status,
    ).toBe("PUBLISHED");
  });

  it("does not overwrite a version that has an attempt", async () => {
    const store = createMemoryContentStore();
    await stageImport(store, { records: [selected1] });
    store.markAttempted("M2-CLEANUP-SELECTED-0001");

    const edited: ImportQuestionInput = {
      ...selected1,
      stem: `${selected1.stem} After an attempt.`,
    };
    const result = await stageImport(store, { records: [edited] });
    expect(result.lines[0]?.outcome).toBe("FAILED");
    expect(store.versions.get("M2-CLEANUP-SELECTED-0001")?.stem).toBe(
      selected1.stem,
    );
  });

  it("inserts a new version for the same item", async () => {
    const store = createMemoryContentStore();
    await stageImport(store, { records: [selected1] });
    const next: ImportQuestionInput = {
      ...selected1,
      question_version: "M2-CLEANUP-SELECTED-0001-B",
      stem: `${selected1.stem} Cleaner option A.`,
    };
    const result = await stageImport(store, { records: [next] });

    expect(result.lines[0]?.outcome).toBe("PASSED");
    expect(store.questions.size).toBe(1);
    expect(store.versions.size).toBe(2);
    expect(store.versions.get("M2-CLEANUP-SELECTED-0001-B")?.question_id).toBe(
      "W4-B015-P01-I017",
    );
  });

  it("records a failed line without writing a version", async () => {
    const store = createMemoryContentStore();
    const result = await stageImport(store, {
      records: [{ ...selected1, system: "UNKNOWN_SYSTEM" }],
    });

    expect(result.batch.failed_count).toBe(1);
    expect(result.lines[0]?.outcome).toBe("FAILED");
    expect(store.versions.size).toBe(0);
    expect(store.questions.size).toBe(0);
  });

  it("applies later rows in the same batch against earlier writes", async () => {
    const store = createMemoryContentStore();
    const result = await stageImport(store, {
      records: [selected1, selected1],
    });

    expect(result.batch.passed_count).toBe(1);
    expect(result.batch.unchanged_count).toBe(1);
    expect(store.versions.size).toBe(1);
  });

  it("keeps prior batches when a second import runs", async () => {
    const store = createMemoryContentStore();
    const first = await stageImport(store, { records: [selected1] });
    const second = await stageImport(store, {
      records: [{ ...selected1, system: "UNKNOWN_SYSTEM" }],
    });

    const batches = await store.listBatches();
    expect(batches).toHaveLength(2);
    expect(first.batch.batch_id).not.toBe(second.batch.batch_id);
    expect((await store.listLines(first.batch.batch_id))[0]?.outcome).toBe(
      "PASSED",
    );
    expect((await store.listLines(second.batch.batch_id))[0]?.outcome).toBe(
      "FAILED",
    );
  });
});
