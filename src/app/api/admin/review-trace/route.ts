import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import { assertPermanentLearnerId } from "@/lib/learner-access";
import { loadReviewTrace } from "@/lib/learner-admin";

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
    const params = new URL(req.url).searchParams;
    const learnerId = params.get("learner_id") ?? "";
    const cycleId = params.get("cycle_id") ?? "";
    if (!learnerId || !cycleId) {
      return jsonWithAdminCors(
        req,
        { ok: false, reason: "Choose a learner and Review cycle." },
        400,
      );
    }
    try {
      assertPermanentLearnerId(learnerId);
    } catch {
      return jsonWithAdminCors(
        req,
        { ok: false, reason: "That learner id is not valid." },
        400,
      );
    }
    const result = await loadReviewTrace({ learnerId, cycleId });
    if (!result.ok) {
      return jsonWithAdminCors(req, { ok: false, reason: result.reason }, 404);
    }
    return jsonWithAdminCors(req, { ok: true, trace: result.trace });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}
