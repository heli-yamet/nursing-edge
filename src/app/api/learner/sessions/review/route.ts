import { learnerFromToken } from "@/lib/learner-auth";
import { readLearnerAccess } from "@/lib/learner-access";
import { readLearnerSessionToken } from "@/lib/learner-cookie";
import { learnerEntryStep } from "@/lib/learner-entry";
import type { Session } from "@/lib/learner-types";
import { startLearnerReviewSession } from "@/lib/review-setup";

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
    if (!(await readLearnerAccess(learner.learner_id))) {
      return Response.json(
        { ok: false, result: "access_unavailable" },
        { status: 403 },
      );
    }

    const outcome = await startLearnerReviewSession(learner.learner_id);
    switch (outcome.result) {
      case "created":
        return Response.json(
          { ok: true, result: "created", session: sessionSummary(outcome.session) },
          { status: 201 },
        );
      case "already_active":
        return Response.json({
          ok: true,
          result: "already_active",
          session: sessionSummary(outcome.session),
        });
      case "other_session":
        return Response.json(
          {
            ok: false,
            result: "other_session",
            session: sessionSummary(outcome.session),
          },
          { status: 409 },
        );
      case "none_due":
        return Response.json({ ok: false, result: "none_due" }, { status: 409 });
      case "unavailable":
        return Response.json({ ok: false, result: "unavailable" }, { status: 422 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
