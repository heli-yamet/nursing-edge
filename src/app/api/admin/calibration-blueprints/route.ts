import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import {
  planCalibrationBlueprint,
  saveCalibrationBlueprint,
} from "@/lib/calibration-blueprint";
import { createMongoContentStore } from "@/lib/mongo-content-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return emptyAdminCors(req);
}

export async function POST(req: Request) {
  try {
    const auth = await requireActiveAdmin(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json()) as { question_version_ids?: unknown };
    const raw = body.question_version_ids;
    if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string")) {
      return jsonWithAdminCors(
        req,
        {
          ok: false,
          reason: "Select exactly 35 imported question versions.",
        },
        400,
      );
    }

    const plan = planCalibrationBlueprint(raw);
    if (!plan.ok) {
      return jsonWithAdminCors(req, { ok: false, reason: plan.reason }, 400);
    }

    const store = await createMongoContentStore();
    const existing = await store.getVersions(plan.question_version_ids);
    if (existing.size !== plan.question_version_ids.length) {
      return jsonWithAdminCors(
        req,
        {
          ok: false,
          reason: "Every selected question version must already be imported.",
        },
        400,
      );
    }

    const saved = await saveCalibrationBlueprint({
      questionVersionIds: plan.question_version_ids,
      actorAdminId: auth.admin.admin_id,
    });
    if (!saved.ok) {
      return jsonWithAdminCors(req, { ok: false, reason: saved.reason }, 400);
    }

    return jsonWithAdminCors(req, {
      ok: true,
      reason: null,
      name: saved.blueprint.name,
      version: saved.blueprint.version,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}
