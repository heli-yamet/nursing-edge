import { describe, expect, it } from "vitest";
import { parseC2Workbook } from "@/lib/c2-parse";
import { buildC2WorkbookBuffer } from "@/lib/c2-workbook";
import { validateImportQuestion } from "@/lib/content-validate";
import { createMemoryContentStore } from "@/lib/content-store";
import { selected1, selected1VersionId } from "@/lib/fixtures/selected-1";
import {
  PRODUCTION_R8,
  readWorkbook,
  workbookExists,
} from "@/lib/fixtures/workbook-paths";
import { isLearnerEligible, stageImport } from "@/lib/stage-import";

describe("C2 workbook parser", () => {
  it("parses Selected 1 shape and validates", async () => {
    const buffer = await buildC2WorkbookBuffer({ questions: [selected1] });
    const records = await parseC2Workbook(buffer);
    expect(records).toHaveLength(1);
    expect(records[0]?.question_version).toBe(selected1VersionId);
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
    const version = store.versions.get(selected1VersionId);
    expect(version?.publication_status).toBe("STAGED");
    expect(version && isLearnerEligible(version)).toBe(false);
  });

  it("keeps a value in its own column when earlier cells are empty", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    );
    zip.file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    );
    zip.file(
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="QUESTIONS" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    );
    zip.file(
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    );
    zip.file(
      "xl/worksheets/sheet1.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="str"><v>original_source_q</v></c>
      <c r="B1" t="str"><v>workbook_row</v></c>
      <c r="C1" t="str"><v>track</v></c>
    </row>
    <row r="2">
      <c r="A2"/>
      <c r="B2"/>
      <c r="C2" t="str"><v>NCLEX</v></c>
    </row>
  </sheetData>
</worksheet>`,
    );
    const buffer = Buffer.from(await zip.generateAsync({ type: "uint8array" }));
    const { readXlsxSheetRows, sheetRowsByName } = await import("@/lib/xlsx-rows");
    const sheets = await readXlsxSheetRows(buffer);
    const row = sheetRowsByName(sheets, "QUESTIONS")?.[0];
    expect(row?.original_source_q).toBe("");
    expect(row?.workbook_row).toBe("");
    expect(row?.track).toBe("NCLEX");
  });
});

describe.skipIf(!workbookExists(PRODUCTION_R8.selected_1_1000))(
  "production Selected 1-1000 (parseC2Workbook smoke)",
  () => {
    it("parses 1000 content rows and validates the first three", async () => {
      const records = await parseC2Workbook(readWorkbook(PRODUCTION_R8.selected_1_1000));
      expect(records).toHaveLength(1000);

      for (const [index, record] of records.slice(0, 3).entries()) {
        expect(record.selected_number).toBe(index + 1);
        expect(record.question_version).not.toBe("");
        expect(record.permanent_item_id).not.toBe("");
        expect(record.options.length).toBeGreaterThan(0);

        const validated = validateImportQuestion(record);
        expect(validated.ok).toBe(true);
        if (validated.ok) {
          expect(isLearnerEligible(validated.version)).toBe(false);
        }
      }
    });
  },
);

describe.skipIf(
  !workbookExists(PRODUCTION_R8.selected_1001_1500) ||
    !workbookExists(PRODUCTION_R8.selected_1501_2000),
)("production Selected 1001-2000 (parseC2Workbook smoke)", () => {
  it("parses 500 rows per mid and high bank", async () => {
    const mid = await parseC2Workbook(readWorkbook(PRODUCTION_R8.selected_1001_1500));
    const last = await parseC2Workbook(readWorkbook(PRODUCTION_R8.selected_1501_2000));
    expect(mid).toHaveLength(500);
    expect(last).toHaveLength(500);
    expect(mid[0]?.selected_number).toBe(1001);
    expect(last[0]?.selected_number).toBe(1501);
    expect(mid[0]?.options.length).toBeGreaterThan(0);
    expect(last[0]?.options.length).toBeGreaterThan(0);
  });
});