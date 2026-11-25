import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import {
  decideAdminAccount,
  listPendingAdminAccounts,
} from "@/lib/admin-accounts";
import { requireSuperAdmin } from "@/lib/admin-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return emptyAdminCors(req);
}

export async function GET(req: Request) {
  try {
    const auth = await requireSuperAdmin(req);
    if (!auth.ok) {
      return auth.response;
    }

    const pending = await listPendingAdminAccounts();
    return jsonWithAdminCors(req, { ok: true, pending });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireSuperAdmin(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json()) as {
      admin_id?: unknown;
      decision?: unknown;
    };
    const adminId = typeof body.admin_id === "string" ? body.admin_id : "";
    const decision =
      body.decision === "approve" || body.decision === "reject"
        ? body.decision
        : null;
    if (!decision) {
      return jsonWithAdminCors(
        req,
        { ok: false, reason: "Use decision approve or reject." },
        400,
      );
    }

    const result = await decideAdminAccount({
      adminId,
      decision,
      actorAdminId: auth.admin.admin_id,
    });
    if (!result.ok) {
      return jsonWithAdminCors(req, { ok: false, reason: result.reason }, 400);
    }

    return jsonWithAdminCors(req, {
      ok: true,
      email: result.email,
      status: result.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}