import { del, get } from "@vercel/blob";
import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import {
  getActiveCalibrationBlueprint,
  reservedCalibrationVersionIds,
  saveCalibrationBlueprint,
  uniqueSuccessfulVersionIds,
} from "@/lib/calibration-blueprint";
import {
  importC2Buffer,
  inspectContentImportFile,
} from "@/lib/content-import";
import { buildEligibilityReport } from "@/lib/eligibility-report";
import { createMongoContentStore } from "@/lib/mongo-content-store";
import { createMongoRelationshipStore } from "@/lib/relationship-store";
import { isContentImportBlob } from "@/lib/workbook-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

    const [batches, imported, versions, reserved, blueprint] = await Promise.all([
      store.listBatches(),
      store.listImportedQuestions(),
      store.listQuestionVersions(),
      reservedCalibrationVersionIds(),
      getActiveCalibrationBlueprint(),
    ]);
    return jsonWithAdminCors(req, {
      ok: true,
      batches: batches.slice().reverse(),
      questions: imported.map((question) => ({
        ...question,
        on_calibration_blueprint: reserved.has(question.question_version_id),
      })),
      eligibility: buildEligibilityReport(versions, reserved),
      calibration: blueprint
        ? {
            name: blueprint.name,
            version: blueprint.version,
            question_version_ids: blueprint.question_version_ids,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}

export async function POST(req: Request) {
  let blobUrl = "";
  try {
    const auth = await requireActiveAdmin(req);
    if (!auth.ok) {
      return auth.response;
    }

    const payload = (await req.json()) as {
      url?: unknown;
      pathname?: unknown;
      fileName?: unknown;
      purpose?: unknown;
    };
    const url = typeof payload.url === "string" ? payload.url : "";
    const pathname = typeof payload.pathname === "string" ? payload.pathname : "";
    const fileName = typeof payload.fileName === "string" ? payload.fileName : "";
    if (!isContentImportBlob(url, pathname)) {
      return jsonWithAdminCors(
        req,
        { ok: false, error: "Choose a C2 .xlsx workbook" },
        400,
      );
    }
    blobUrl = url;

    const downloaded = await get(url, { access: "private", useCache: false });
    if (!downloaded || downloaded.statusCode !== 200) {
      return jsonWithAdminCors(
        req,
        { ok: false, error: "Workbook upload was not found" },
        400,
      );
    }

    console.log("downloaded", downloaded);

    const bytes = Buffer.from(await new Response(downloaded.stream).arrayBuffer());
    const inspected = inspectContentImportFile({
      fileName,
      byteLength: bytes.byteLength,
    });
    if (!inspected.ok) {
      return jsonWithAdminCors(
        req,
        { ok: false, error: inspected.error },
        inspected.status,
      );
    }

    console.log("bytes", bytes.length);
    console.log("inspected", inspected);

    const store = await createMongoContentStore();
    const relationships = await createMongoRelationshipStore();
    const result = await importC2Buffer(
      store,
      bytes,
      inspected.source,
      relationships,
    );
    const purpose = payload.purpose === "calibration" ? "calibration" : "bank";
    let calibration: {
      ok: boolean;
      reason: string | null;
    } | null = null;
    if (purpose === "calibration") {
      const saved = await saveCalibrationBlueprint({
        questionVersionIds: uniqueSuccessfulVersionIds(result.lines),
        actorAdminId: auth.admin.admin_id,
      });
      calibration = saved.ok
        ? { ok: true, reason: null }
        : { ok: false, reason: saved.reason };
    }

    return jsonWithAdminCors(req, {
      ok: true,
      published: false,
      batch: result.batch,
      lines: result.lines,
      domains: result.domains,
      calibration,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    const status = /QUESTIONS sheet|valid \.xlsx/i.test(message) ? 400 : 500;
    return jsonWithAdminCors(req, { ok: false, error: message }, status);
  } finally {
    if (blobUrl) {
      await del(blobUrl).catch(() => undefined);
    }
  }
}
