import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { requireActiveAdmin } from "@/lib/admin-request";
import { loadQuestionDetail } from "@/lib/question-detail";

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
    const questionVersionId = new URL(req.url).searchParams.get(
      "question_version_id",
    );
    if (!questionVersionId) {
      return jsonWithAdminCors(
        req,
        { ok: false, reason: "Choose a question." },
        400,
      );
    }
    const detail = await loadQuestionDetail(questionVersionId);
    if (!detail) {
      return jsonWithAdminCors(
        req,
        { ok: false, reason: "That question is not stored." },
        404,
      );
    }
    return jsonWithAdminCors(req, { ok: true, detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}
