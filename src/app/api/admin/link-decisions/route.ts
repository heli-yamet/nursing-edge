import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import { systemClock } from "@/lib/clock";
import {
  applyLinkDecisions,
  createMongoLinkDecisionStore,
  listAdminLinks,
  parseLinkDecisionBody,
} from "@/lib/link-decisions";

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
    const links = await listAdminLinks();
    return jsonWithAdminCors(req, { ok: true, links });
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

    const parsed = parseLinkDecisionBody(await req.json());
    if (!parsed.ok) {
      return jsonWithAdminCors(
        req,
        { ok: false, reason: parsed.reason },
        400,
      );
    }

    const result = await applyLinkDecisions(createMongoLinkDecisionStore(), {
      targets: parsed.targets,
      action: parsed.action,
      adminId: auth.admin.admin_id,
      now: systemClock.now(),
    });
    if (!result.ok) {
      return jsonWithAdminCors(req, { ok: false, reason: result.reason }, 400);
    }

    return jsonWithAdminCors(req, { ok: true, reason: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}
