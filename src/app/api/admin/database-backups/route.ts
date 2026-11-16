import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireSuperAdmin } from "@/lib/admin-request";
import { defaultBackupNameForEnv, listStoredBackups } from "@/lib/database-backup-runner";
import { getRunningDatabaseBackupJob } from "@/lib/database-backup-job";

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

    const [backups, job] = await Promise.all([
      listStoredBackups(),
      getRunningDatabaseBackupJob(),
    ]);

    return jsonWithAdminCors(req, {
      ok: true,
      backups,
      active_job: job,
      default_backup_name: defaultBackupNameForEnv(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}