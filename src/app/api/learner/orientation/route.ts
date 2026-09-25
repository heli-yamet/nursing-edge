import { learnerEntryPath } from "@/lib/learner-entry";
import { completeOrientation, learnerFromToken } from "@/lib/learner-auth";
import { readLearnerSessionToken } from "@/lib/learner-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const learner = await learnerFromToken(await readLearnerSessionToken());
    if (!learner) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    if (!learner.terms_accepted_at) {
      return Response.json({ ok: false, next: "/terms" }, { status: 409 });
    }

    const updated = await completeOrientation(learner.learner_id);
    if (!updated?.orientation_completed_at) {
      return Response.json({ ok: false, error: "server_error" }, { status: 500 });
    }

    return Response.json({ ok: true, next: learnerEntryPath(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
