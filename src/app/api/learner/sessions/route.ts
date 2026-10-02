import { learnerFromToken } from "@/lib/learner-auth";
import { readLearnerSessionToken } from "@/lib/learner-cookie";
import { learnerEntryStep } from "@/lib/learner-entry";
import type { Session } from "@/lib/learner-types";
import { INSUFFICIENT_SUPPLY_MESSAGE } from "@/lib/practice-options";
import { startLearnerPracticeSession } from "@/lib/practice-setup";

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

export async function POST(req: Request) {
  try {
    const learner = await learnerFromToken(await readLearnerSessionToken());
    if (!learner) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (learnerEntryStep(learner) !== "home") {
      return Response.json({ ok: false, error: "entry_incomplete" }, { status: 409 });
    }

    let body: { scope?: unknown; size?: unknown };
    try {
      body = (await req.json()) as { scope?: unknown; size?: unknown };
    } catch {
      return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    const outcome = await startLearnerPracticeSession({
      learnerId: learner.learner_id,
      scope: body.scope,
      size: body.size,
    });

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
      case "insufficient_supply":
        return Response.json(
          {
            ok: false,
            result: "insufficient_supply",
            reason: INSUFFICIENT_SUPPLY_MESSAGE,
          },
          { status: 422 },
        );
      case "invalid_request":
        return Response.json(
          { ok: false, result: "invalid_request" },
          { status: 400 },
        );
      case "not_authorized":
        return Response.json(
          { ok: false, result: "access_unavailable" },
          { status: 403 },
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
