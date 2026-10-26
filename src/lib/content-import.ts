import type { ContentStore } from "@/lib/content-store";
import { parseC2Sheets } from "@/lib/c2-parse";
import {
  emptyDomainCounts,
  importWorkbookRelationships,
  type DomainCounts,
  type RelationshipDomains,
  type WorkbookRole,
} from "@/lib/relationship-import";
import type { RelationshipStore } from "@/lib/relationship-store";
import { stageImport, type StageImportResult } from "@/lib/stage-import";
import { readXlsxSheetRows } from "@/lib/xlsx-rows";

export const MAX_CONTENT_IMPORT_BYTES = 10 * 1024 * 1024;

export type ContentImportResult = StageImportResult & {
  domains: RelationshipDomains & { content: DomainCounts };
  workbook_role: WorkbookRole;
};

export type ContentImportFileCheck =
  | { ok: true; source: string }
  | { ok: false; status: number; error: string };

export function importSourceName(fileName: string): string {
  const trimmed = fileName.trim().replace(/\\/g, "/");
  const base = trimmed.split("/").pop() ?? "";
  return base || "workbook.xlsx";
}

export function inspectContentImportFile(input: {
  fileName: string;
  byteLength: number;
}): ContentImportFileCheck {
  const source = importSourceName(input.fileName);
  if (!source.toLowerCase().endsWith(".xlsx")) {
    return {
      ok: false,
      status: 400,
      error: "Upload a C2 .xlsx workbook",
    };
  }
  if (input.byteLength < 1) {
    return { ok: false, status: 400, error: "The workbook is empty" };
  }
  if (input.byteLength > MAX_CONTENT_IMPORT_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "Workbook is larger than 10 MB",
    };
  }
  return { ok: true, source };
}

export async function importC2Buffer(
  store: ContentStore,
  buffer: Buffer,
  source: string,
  relationships?: RelationshipStore | null,
): Promise<ContentImportResult> {
  const sheets = await readXlsxSheetRows(buffer);
  const records = parseC2Sheets(sheets);
  const staged = await stageImport(store, { records, source });
  const relationshipResult = await importWorkbookRelationships({
    sheets,
    source,
    store: relationships ?? null,
  });
  return {
    ...staged,
    domains: {
      content: {
        ...emptyDomainCounts(),
        passed: staged.batch.passed_count,
        failed: staged.batch.failed_count,
        unchanged: staged.batch.unchanged_count,
      },
      ...relationshipResult.domains,
    },
    workbook_role: relationshipResult.workbook_role,
  };
}
