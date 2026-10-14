export const WORKBOOK_BLOB_PREFIX = "content-imports/";

export const WORKBOOK_CONTENT_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
];

export function contentImportBlobPath(fileName: string): string | null {
  const base = fileName.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  if (!/^[^/\\]+\.xlsx$/i.test(base)) {
    return null;
  }
  return `${WORKBOOK_BLOB_PREFIX}${base}`;
}

export function isContentImportBlob(url: string, pathname: string): boolean {
  if (!/^content-imports\/[^/]+\.xlsx$/i.test(pathname)) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") {
    return false;
  }
  if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) {
    return false;
  }
  const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  return path === pathname;
}
