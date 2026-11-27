import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import { startBackupJob } from "@/lib/database-backup-runner";

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

    const body = (await req.json()) as { backup_name?: unknown };
    const backup_name =
      typeof body.backup_name === "string" ? body.backup_name.trim() : "";
    if (!backup_name) {
      return jsonWithAdminCors(req, { ok: false, error: "backup_name_required" }, 400);
    }

    const job = await startBackupJob({
      backup_name,
      started_by_admin_id: auth.admin.admin_id,
      started_by_email: auth.admin.email,
    });

    return jsonWithAdminCors(req, { ok: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    const status = message.includes("already running") ? 409 : 500;
    return jsonWithAdminCors(req, { ok: false, error: message }, status);
  }
}