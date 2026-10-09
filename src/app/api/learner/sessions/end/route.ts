import { endLearnerSession } from "@/lib/mongo-session-store";
import { learnerFromToken } from "@/lib/learner-auth";
import { readLearnerSessionToken } from "@/lib/learner-cookie";
import { learnerEntryStep } from "@/lib/learner-entry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const learner = await learnerFromToken(await readLearnerSessionToken());
    if (!learner) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (learnerEntryStep(learner) !== "home") {
      return Response.json(
        { ok: false, error: "entry_incomplete" },
        { status: 409 },
      );
    }

    const outcome = await endLearnerSession(learner.learner_id);
    switch (outcome.result) {
      case "ended":
        return Response.json({
          ok: true,
          result: "ended",
          submitted: outcome.submitted,
          size: outcome.size,
        });
      case "no_session":
        return Response.json({ ok: false, result: "no_session" }, { status: 404 });
      case "not_playable":
        return Response.json(
          { ok: false, result: "not_playable" },
          { status: 409 },
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
