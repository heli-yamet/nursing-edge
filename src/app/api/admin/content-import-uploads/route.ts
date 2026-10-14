import { issueSignedToken } from "@vercel/blob";
import {
  handleUploadPresigned,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";
import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import { MAX_CONTENT_IMPORT_BYTES } from "@/lib/content-import";
import { WORKBOOK_CONTENT_TYPES } from "@/lib/workbook-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

export function OPTIONS(req: Request) {
  return emptyAdminCors(req);
}

export async function POST(req: Request) {
  let body: HandleUploadPresignedBody;
  try {
    body = (await req.json()) as HandleUploadPresignedBody;
  } catch {
    return jsonWithAdminCors(req, { error: "Invalid upload request" }, 400);
  }

  try {
    const jsonResponse = await handleUploadPresigned({
      body,
      request: req,
      getSignedToken: async (pathname) => {
        const auth = await requireActiveAdmin(req);
        if (!auth.ok) {
          throw new Error("Sign in again before uploading a workbook.");
        }
        if (!/^content-imports\/[^/]+\.xlsx$/i.test(pathname)) {
          throw new Error("Upload a C2 .xlsx workbook");
        }
        const validUntil = Date.now() + UPLOAD_WINDOW_MS;
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: WORKBOOK_CONTENT_TYPES,
          maximumSizeInBytes: MAX_CONTENT_IMPORT_BYTES,
          validUntil,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: WORKBOOK_CONTENT_TYPES,
            maximumSizeInBytes: MAX_CONTENT_IMPORT_BYTES,
            validUntil,
            addRandomSuffix: true,
            allowOverwrite: false,
          },
        };
      },
    });
    return jsonWithAdminCors(req, jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload_failed";
    return jsonWithAdminCors(req, { error: message }, 400);
  }
}
