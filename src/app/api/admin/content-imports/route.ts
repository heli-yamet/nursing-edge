import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import {
  importC2Buffer,
  inspectContentImportFile,
} from "@/lib/content-import";
import { createMongoContentStore } from "@/lib/mongo-content-store";

export const runtime = "nodejs";
export const maxDuration = 900;

export function OPTIONS(req: Request) {
  return emptyAdminCors(req);
}

export async function GET(req: Request) {
  try {
    const auth = await requireActiveAdmin(req);
    if (!auth.ok) {
      return auth.response;
    }

    const store = await createMongoContentStore();
    const batchId = new URL(req.url).searchParams.get("batch_id");
    if (batchId) {
      const lines = await store.listLines(batchId);
      return jsonWithAdminCors(req, { ok: true, lines });
    }

    const batches = (await store.listBatches()).slice().reverse();
    return jsonWithAdminCors(req, { ok: true, batches });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireActiveAdmin(req);
    if (!auth.ok) {
      return auth.response;
    }

    const form = await req.formData();
    const uploaded = form.get("file");
    if (!(uploaded instanceof File)) {
      return jsonWithAdminCors(
        req,
        { ok: false, error: "Choose a C2 .xlsx workbook" },
        400,
      );
    }

    const bytes = Buffer.from(await uploaded.arrayBuffer());
    const inspected = inspectContentImportFile({
      fileName: uploaded.name,
      byteLength: bytes.byteLength,
    });
    if (!inspected.ok) {
      return jsonWithAdminCors(
        req,
        { ok: false, error: inspected.error },
        inspected.status,
      );
    }

    const store = await createMongoContentStore();
    const result = await importC2Buffer(store, bytes, inspected.source);
    return jsonWithAdminCors(req, {
      ok: true,
      published: false,
      batch: result.batch,
      lines: result.lines,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    const status = /QUESTIONS sheet|valid \.xlsx/i.test(message) ? 400 : 500;
    return jsonWithAdminCors(req, { ok: false, error: message }, status);
  }
}
