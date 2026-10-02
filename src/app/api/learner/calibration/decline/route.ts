import { readLearnerAccess } from "@/lib/learner-access";
import { learnerFromToken } from "@/lib/learner-auth";
import { readLearnerSessionToken } from "@/lib/learner-cookie";
import { learnerEntryStep } from "@/lib/learner-entry";
import { declineCalibration } from "@/lib/calibration-entry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const learner = await learnerFromToken(await readLearnerSessionToken());
    if (!learner) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (learnerEntryStep(learner) !== "home") {
      return Response.json({ ok: false, error: "entry_incomplete" }, { status: 409 });
    }
    if (!(await readLearnerAccess(learner.learner_id))) {
      return Response.json({ ok: false, error: "access_unavailable" }, { status: 403 });
    }

    const state = await declineCalibration(learner.learner_id);
    return Response.json({ ok: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
