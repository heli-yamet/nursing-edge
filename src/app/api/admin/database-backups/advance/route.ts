import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import { advanceDatabaseBackupJob } from "@/lib/database-backup-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function OPTIONS(req: Request) {
  return emptyAdminCors(req);
}

export async function POST(req: Request) {
  try {
    const auth = await requireActiveAdmin(req);
    if (!auth.ok) {
      return auth.response;
    }

    let jobId: string | undefined;
    try {
      const body = (await req.json()) as { job_id?: unknown };
      if (typeof body.job_id === "string" && body.job_id.trim()) {
        jobId = body.job_id.trim();
      }
    } catch {
      jobId = undefined;
    }

    const job = await advanceDatabaseBackupJob(jobId);
    return jsonWithAdminCors(req, { ok: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}