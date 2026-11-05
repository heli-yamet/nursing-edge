import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import { parseLearningEvidenceFilters } from "@/lib/learning-evidence";
import { loadLearningEvidence } from "@/lib/mongo-learning-evidence";

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

    const parsed = parseLearningEvidenceFilters(new URL(req.url).searchParams);
    if (!parsed.ok) {
      return jsonWithAdminCors(req, { ok: false, reason: parsed.reason }, 400);
    }

    const summary = await loadLearningEvidence(parsed.filters);
    return jsonWithAdminCors(req, { ok: true, evidence: summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}
