import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import { loadAdminOverview } from "@/lib/admin-overview";
import { systemClock } from "@/lib/clock";

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

    const overview = await loadAdminOverview(systemClock.now());
    return jsonWithAdminCors(req, { ok: true, overview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}
