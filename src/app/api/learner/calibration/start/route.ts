import { learnerFromToken } from "@/lib/learner-auth";
import { readLearnerSessionToken } from "@/lib/learner-cookie";
import { learnerEntryStep } from "@/lib/learner-entry";
import type { Session } from "@/lib/learner-types";
import { startLearnerBaselineSession } from "@/lib/practice-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionSummary(session: Session) {
  return {
    session_id: session.session_id,
    type: session.type,
    scope: session.scope,
    size: session.size,
    state: session.state,
  };
}

export async function POST() {
  try {
    const learner = await learnerFromToken(await readLearnerSessionToken());
    if (!learner) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (learnerEntryStep(learner) !== "home") {
      return Response.json({ ok: false, error: "entry_incomplete" }, { status: 409 });
    }

    const outcome = await startLearnerBaselineSession(learner.learner_id);
    switch (outcome.result) {
      case "created":
        return Response.json(
          { ok: true, result: "created", session: sessionSummary(outcome.session) },
          { status: 201 },
        );
      case "already_active":
        return Response.json(
          {
            ok: false,
            result: "already_active",
            session: sessionSummary(outcome.session),
          },
          { status: 409 },
        );
      case "not_offered":
        return Response.json(
          { ok: false, result: "not_offered" },
          { status: 409 },
        );
      case "unavailable":
        return Response.json(
          { ok: false, result: "unavailable" },
          { status: 422 },
        );
      case "not_authorized":
        return Response.json(
          { ok: false, error: "access_unavailable" },
          { status: 403 },
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
