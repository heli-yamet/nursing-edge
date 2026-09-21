import { describe, expect, it } from "vitest";
import { buildC2WorkbookBuffer } from "@/lib/c2-workbook";
import { createMemoryContentStore } from "@/lib/content-store";
import {
  importC2Buffer,
  inspectContentImportFile,
  MAX_CONTENT_IMPORT_BYTES,
} from "@/lib/content-import";
import { selected1 } from "@/lib/fixtures/selected-1";
import { isLearnerEligible } from "@/lib/stage-import";

describe("content import", () => {
  it("rejects files that are not .xlsx", () => {
    const result = inspectContentImportFile({
      fileName: "bank.csv",
      byteLength: 1200,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  it("rejects workbooks larger than 10 MB", () => {
    const result = inspectContentImportFile({
      fileName: "bank.xlsx",
      byteLength: MAX_CONTENT_IMPORT_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
    }
  });

  it("keeps only the file name as the batch source", () => {
    const result = inspectContentImportFile({
      fileName: "C:\\\\Uploads\\\\1-1000 excel Nursing_Edge.xlsx",
      byteLength: 2048,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("1-1000 excel Nursing_Edge.xlsx");
    }
  });

  it("stages a parsed workbook without publishing", async () => {
    const buffer = await buildC2WorkbookBuffer({ questions: [selected1] });
    const store = createMemoryContentStore();
    const result = await importC2Buffer(store, buffer, "selected-1.xlsx");

    expect(result.batch.source).toBe("selected-1.xlsx");
    expect(result.batch.passed_count).toBe(1);
    expect(result.lines[0]?.outcome).toBe("PASSED");
    const version = store.versions.get("M2-CLEANUP-SELECTED-0001");
    expect(version?.publication_status).toBe("STAGED");
    expect(version && isLearnerEligible(version)).toBe(false);
  });

  it("records FAILED lines for invalid rows", async () => {
    const buffer = await buildC2WorkbookBuffer({
      questions: [{ ...selected1, system: "UNKNOWN_SYSTEM" }],
    });
    const store = createMemoryContentStore();
    const result = await importC2Buffer(store, buffer, "bad.xlsx");

    expect(result.batch.failed_count).toBe(1);
    expect(result.lines[0]?.outcome).toBe("FAILED");
    expect(store.versions.size).toBe(0);
  });
});
