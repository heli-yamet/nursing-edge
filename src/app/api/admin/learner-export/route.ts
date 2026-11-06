import {
  emptyAdminCors,
  fileWithAdminCors,
  jsonWithAdminCors,
} from "@/lib/admin-http";
import { isOperatorRole, learnerExportFilename } from "@/lib/admin-audit";
import { requireActiveAdmin } from "@/lib/admin-request";
import { systemClock } from "@/lib/clock";
import { exportLearnerEvidence } from "@/lib/mongo-admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return emptyAdminCors(req);
}

export async function GET(req: Request) {
  try {
    const auth = await requireActiveAdmin(req);
    if (!auth.ok) {
      return auth.response;
    }
    if (!isOperatorRole(auth.admin.role)) {
      return jsonWithAdminCors(
        req,
        { ok: false, reason: "Learner export is limited to the operator account." },
        403,
      );
    }

    const learnerId = new URL(req.url).searchParams.get("learner_id")?.trim() ?? "";
    if (learnerId === "") {
      return jsonWithAdminCors(
        req,
        { ok: false, reason: "Enter a learner id." },
        400,
      );
    }

    const result = await exportLearnerEvidence({
      actorAdminId: auth.admin.admin_id,
      learnerId,
      now: systemClock.now(),
    });
    if (!result.ok) {
      return jsonWithAdminCors(req, { ok: false, reason: result.reason }, 404);
    }

    return fileWithAdminCors(
      req,
      JSON.stringify(result.body, null, 2),
      learnerExportFilename(learnerId),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}
