import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import { searchLearnerByEmail } from "@/lib/learner-admin";

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
    const email = new URL(req.url).searchParams.get("email") ?? "";
    const result = await searchLearnerByEmail(email);
    if (!result.ok) {
      return jsonWithAdminCors(req, { ok: false, reason: result.reason }, 404);
    }
    return jsonWithAdminCors(req, { ok: true, learner: result.learner });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}
