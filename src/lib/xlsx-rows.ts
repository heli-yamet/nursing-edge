import JSZip from "jszip";

export type SheetRow = Record<string, string>;

const WORKSHEET_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCharCode(Number(dec)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(attrs: string, name: string): string {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "i").exec(attrs);
  return match?.[1] ?? "";
}

function relationshipId(attrs: string): string {
  const prefixed = /(?:^|\s)[\w.]+:id="([^"]*)"/i.exec(attrs);
  if (prefixed) {
    return prefixed[1] ?? "";
  }
  return attr(attrs, "id");
}

function colNumber(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? "";
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

function zipPath(target: string): string {
  let normalized = target.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  } else if (!normalized.startsWith("xl/")) {
    normalized = `xl/${normalized.replace(/^\.\//, "")}`;
  }
  return normalized;
}

function collectTextNodes(xml: string): string {
  let out = "";
  const textRe = /<(?:[\w.]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.]+:)?t>/g;
  let match = textRe.exec(xml);
  while (match) {
    out += decodeXml(match[1] ?? "");
    match = textRe.exec(xml);
  }
  return out;
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siRe = /<(?:[\w.]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.]+:)?si>/g;
  let match = siRe.exec(xml);
  while (match) {
    strings.push(collectTextNodes(match[1] ?? ""));
    match = siRe.exec(xml);
  }
  return strings;
}

function cellValue(
  attrs: string,
  inner: string,
  sharedStrings: string[],
): string {
  const type = attr(attrs, "t").toLowerCase();
  if (type === "inlineStr") {
    return collectTextNodes(inner).trim();
  }

  const raw = /<(?:[\w.]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[\w.]+:)?v>/.exec(inner);
  const value = decodeXml((raw?.[1] ?? "").trim());
  if (type === "s") {
    const index = Number(value);
    return Number.isFinite(index) ? (sharedStrings[index] ?? "").trim() : "";
  }
  if (type === "b") {
    const normalized = value.toUpperCase();
    if (normalized === "1" || normalized === "TRUE") {
      return "TRUE";
    }
    if (normalized === "0" || normalized === "FALSE") {
      return "FALSE";
    }
    return value;
  }
  return value;
}

function parseSheetData(
  xml: string,
  sharedStrings: string[],
): SheetRow[] {
  const headers: string[] = [];
  const rows: SheetRow[] = [];
  const rowRe = /<(?:[\w.]+:)?row\b[^>]*>([\s\S]*?)<\/(?:[\w.]+:)?row>/g;
  let rowMatch = rowRe.exec(xml);
  let rowIndex = 0;

  while (rowMatch) {
    rowIndex += 1;
    const cells = new Map<number, string>();
    const cellRe =
      /<(?:[\w.]+:)?c\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:[\w.]+:)?c>)/g;
    const rowXml = rowMatch[1] ?? "";
    let cellMatch = cellRe.exec(rowXml);
    while (cellMatch) {
      const col = colNumber(attr(cellMatch[1] ?? "", "r"));
      cells.set(col, cellValue(cellMatch[1] ?? "", cellMatch[2] ?? "", sharedStrings));
      cellMatch = cellRe.exec(rowXml);
    }

    if (rowIndex === 1) {
      const maxCol = Math.max(0, ...cells.keys());
      for (let col = 1; col <= maxCol; col += 1) {
        headers[col] = (cells.get(col) ?? "").trim();
      }
    } else {
      const record: SheetRow = {};
      let any = false;
      headers.forEach((header, col) => {
        if (!header) {
          return;
        }
        const text = (cells.get(col) ?? "").trim();
        record[header] = text;
        if (text) {
          any = true;
        }
      });
      if (any) {
        rows.push(record);
      }
    }

    rowMatch = rowRe.exec(xml);
  }

  return rows;
}

async function readZipFile(
  zip: JSZip,
  name: string,
): Promise<string | undefined> {
  const entry = zip.file(name) ?? zip.file(name.replace(/^\//, ""));
  if (!entry) {
    return undefined;
  }
  return entry.async("string");
}

export async function readXlsxSheetRows(
  buffer: Buffer,
): Promise<Map<string, SheetRow[]>> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("File is not a valid .xlsx workbook");
  }

  const workbookXml = await readZipFile(zip, "xl/workbook.xml");
  if (!workbookXml) {
    throw new Error("File is not a valid .xlsx workbook");
  }

  const relsXml = (await readZipFile(zip, "xl/_rels/workbook.xml.rels")) ?? "";
  const relTargets = new Map<string, string>();
  const relRe = /<(?:[\w.]+:)?Relationship\b([^>]*)/g;
  let relMatch = relRe.exec(relsXml);
  while (relMatch) {
    const attrs = relMatch[1] ?? "";
    if (attr(attrs, "Type") === WORKSHEET_REL) {
      relTargets.set(attr(attrs, "Id"), zipPath(attr(attrs, "Target")));
    }
    relMatch = relRe.exec(relsXml);
  }

  const sharedXml = (await readZipFile(zip, "xl/sharedStrings.xml")) ?? "";
  const sharedStrings = parseSharedStrings(sharedXml);

  const sheets = new Map<string, SheetRow[]>();
  const sheetRe = /<(?:[\w.]+:)?sheet\b([^>]*)/g;
  let sheetMatch = sheetRe.exec(workbookXml);
  while (sheetMatch) {
    const attrs = sheetMatch[1] ?? "";
    const name = attr(attrs, "name");
    const target = relTargets.get(relationshipId(attrs));
    if (name && target) {
      const sheetXml = (await readZipFile(zip, target)) ?? "";
      sheets.set(name, parseSheetData(sheetXml, sharedStrings));
    }
    sheetMatch = sheetRe.exec(workbookXml);
  }

  return sheets;
}

export function sheetRowsByName(
  sheets: Map<string, SheetRow[]>,
  name: string,
): SheetRow[] | undefined {
  const wanted = name.trim().toUpperCase();
  for (const [sheetName, rows] of sheets) {
    if (sheetName.trim().toUpperCase() === wanted) {
      return rows;
    }
  }
  return undefined;
}
