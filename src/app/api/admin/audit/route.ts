import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { parseAuditFilters } from "@/lib/admin-audit";
import { requireActiveAdmin } from "@/lib/admin-request";
import { loadAdminAudit } from "@/lib/mongo-admin-audit";

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

    const parsed = parseAuditFilters(new URL(req.url).searchParams);
    if (!parsed.ok) {
      return jsonWithAdminCors(req, { ok: false, reason: parsed.reason }, 400);
    }

    const audit = await loadAdminAudit(parsed.filters);
    return jsonWithAdminCors(req, { ok: true, audit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}
