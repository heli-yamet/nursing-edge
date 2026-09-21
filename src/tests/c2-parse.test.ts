import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseC2Workbook } from "@/lib/c2-parse";
import { buildC2WorkbookBuffer } from "@/lib/c2-workbook";
import { validateImportQuestion } from "@/lib/content-validate";
import { createMemoryContentStore } from "@/lib/content-store";
import { selected1 } from "@/lib/fixtures/selected-1";
import { isLearnerEligible, stageImport } from "@/lib/stage-import";

function resourceXlsx(fileName: string): Buffer {
  return fs.readFileSync(path.resolve(process.cwd(), "../resources", fileName));
}

describe("C2 workbook parser", () => {
  it("parses Selected 1 shape and validates", async () => {
    const buffer = await buildC2WorkbookBuffer({ questions: [selected1] });
    const records = await parseC2Workbook(buffer);
    expect(records).toHaveLength(1);
    expect(records[0]?.question_version).toBe("M2-CLEANUP-SELECTED-0001");
    expect(records[0]?.permanent_item_id).toBe("W4-B015-P01-I017");
    expect(records[0]?.options).toHaveLength(4);
    expect(records[0]?.options.filter((option) => option.is_correct)).toHaveLength(
      1,
    );

    const validated = validateImportQuestion(records[0]!);
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    expect(isLearnerEligible(validated.version)).toBe(false);
  });

  it("still emits a broken row so staging can mark FAILED", async () => {
    const buffer = await buildC2WorkbookBuffer({
      questions: [{ ...selected1, system: "UNKNOWN_SYSTEM" }],
    });
    const records = await parseC2Workbook(buffer);
    expect(records).toHaveLength(1);

    const store = createMemoryContentStore();
    const result = await stageImport(store, { records });
    expect(result.lines[0]?.outcome).toBe("FAILED");
    expect(store.versions.size).toBe(0);
  });

  it("emits questions with empty options when OPTIONS is missing", async () => {
    const buffer = await buildC2WorkbookBuffer({
      questions: [selected1],
      includeOptions: false,
    });
    const records = await parseC2Workbook(buffer);
    expect(records[0]?.options).toEqual([]);

    const store = createMemoryContentStore();
    const result = await stageImport(store, { records });
    expect(result.lines[0]?.outcome).toBe("FAILED");
    expect(result.lines[0]?.errors.some((error) => /options are required/i.test(error))).toBe(
      true,
    );
  });

  it("rejects a workbook without QUESTIONS", async () => {
    const workbookBuffer = await buildC2WorkbookBuffer({
      questions: [selected1],
    });
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBuffer as unknown as ArrayBuffer);
    const questions = workbook.getWorksheet("QUESTIONS");
    if (questions) {
      workbook.removeWorksheet(questions.id);
    }
    const stripped = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(parseC2Workbook(stripped)).rejects.toThrow(/QUESTIONS sheet/i);
  });

  it("stages a parsed Selected 1 row without publishing", async () => {
    const buffer = await buildC2WorkbookBuffer({ questions: [selected1] });
    const records = await parseC2Workbook(buffer);
    const store = createMemoryContentStore();
    const result = await stageImport(store, { records, source: "c2-fixture" });

    expect(result.lines[0]?.outcome).toBe("PASSED");
    const version = store.versions.get("M2-CLEANUP-SELECTED-0001");
    expect(version?.publication_status).toBe("STAGED");
    expect(version && isLearnerEligible(version)).toBe(false);
  });

  it("loads the first 3 questions from the PO 1-1000 C2 workbook", async () => {
    const records = await parseC2Workbook(
      resourceXlsx(
        "1-1000 excel Nursing_Edge_Questions_1-1000_Developer_Import_C2.xlsx",
      ),
    );
    expect(records).toHaveLength(1000);

    const firstThree = records.slice(0, 3);
    expect(firstThree).toHaveLength(3);

    for (const [index, record] of firstThree.entries()) {
      expect(record.selected_number).toBe(index + 1);
      expect(record.question_version).not.toBe("");
      expect(record.permanent_item_id).not.toBe("");
      expect(record.options.length).toBeGreaterThan(0);

      const validated = validateImportQuestion(record);
      expect(validated.ok).toBe(true);
      if (validated.ok) {
        expect(isLearnerEligible(validated.version)).toBe(false);
      }

      console.log(
        `C2 parsed Q${record.selected_number}: question_version=${record.question_version} permanent_item_id=${record.permanent_item_id}`,
      );
    }

    const first = firstThree[0];
    expect(first?.question_version).toBe(selected1.question_version);
    expect(first?.permanent_item_id).toBe(selected1.permanent_item_id);
    expect(first?.stem).toBe(selected1.stem);
    expect(first?.displayed_correct_answer).toBe("C");
    expect(first?.options).toHaveLength(4);
    expect(
      first?.options.find((option) => option.displayed_option === "C")
        ?.is_correct,
    ).toBe(true);
    expect(
      first?.options.find((option) => option.displayed_option === "A")
        ?.is_correct,
    ).toBe(false);
    expect(first?.rationales.clinical_key_justification).toBe(
      selected1.rationales.clinical_key_justification,
    );
  });

  it("loads the remaining C2 bank workbooks", async () => {
    const mid = await parseC2Workbook(
      resourceXlsx(
        "1001_1500 Nursing_Edge_Questions_1001-1500_Developer_Import_C2_SCHEMA_FIXED_R1.xlsx",
      ),
    );
    const last = await parseC2Workbook(
      resourceXlsx(
        "1501_2000 Nursing_Edge_Questions_1501-2000_Developer_Import_C2_SCHEMA_FIXED_R1.xlsx",
      ),
    );
    expect(mid).toHaveLength(500);
    expect(last).toHaveLength(500);
    expect(mid[0]?.selected_number).toBe(1001);
    expect(last[0]?.selected_number).toBe(1501);
    expect(mid[0]?.options.length).toBeGreaterThan(0);
    expect(last[0]?.options.length).toBeGreaterThan(0);
  });
});
