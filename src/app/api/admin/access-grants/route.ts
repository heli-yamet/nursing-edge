import { jsonWithAdminCors, emptyAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import {
  grantUnpaidAccess,
  listRecentAccessGrantAudits,
} from "@/lib/learner-access";

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

    const audits = await listRecentAccessGrantAudits();
    return jsonWithAdminCors(req, {
      ok: true,
      grants: audits.map((audit) => ({
        audit_id: audit.audit_id,
        email: audit.email,
        occurred_at: audit.occurred_at,
        outcome: audit.outcome,
        reason: audit.reason,
      })),
    });
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

    const body = (await req.json()) as { email?: string };
    const result = await grantUnpaidAccess({
      actorAdminId: auth.admin.admin_id,
      email: body.email ?? "",
    });

    return jsonWithAdminCors(req, {
      ok: result.outcome === "GRANTED",
      outcome: result.outcome,
      email: result.email,
      reason: result.reason,
      entitlement_id: result.entitlement_id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}
