import type { ContentStore } from "@/lib/content-store";
import { parseC2Workbook } from "@/lib/c2-parse";
import { stageImport, type StageImportResult } from "@/lib/stage-import";

export const MAX_CONTENT_IMPORT_BYTES = 10 * 1024 * 1024;

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
): Promise<StageImportResult> {
  const records = await parseC2Workbook(buffer);
  return stageImport(store, { records, source });
}
