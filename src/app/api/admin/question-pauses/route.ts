import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import { createMongoContentStore } from "@/lib/mongo-content-store";
import {
  pausePublishedVersions,
  recordPauseAudit,
} from "@/lib/pause-versions";

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
      await recordPauseAudit({
        actorAdminId: auth.admin.admin_id,
        questionVersionIds: [],
        outcome: "REJECTED",
        reason: "Select published question versions.",
      });
      return jsonWithAdminCors(
        req,
        {
          ok: false,
          reason: "Select published question versions.",
          lines: [],
        },
        400,
      );
    }

    const questionVersionIds = raw;
    const store = await createMongoContentStore();
    const result = await pausePublishedVersions(store, questionVersionIds);
    await recordPauseAudit({
      actorAdminId: auth.admin.admin_id,
      questionVersionIds,
      outcome: result.ok ? "PAUSED" : "REJECTED",
      reason: result.reason,
    });

    return jsonWithAdminCors(req, {
      ok: result.ok,
      reason: result.reason,
      lines: result.lines,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}
