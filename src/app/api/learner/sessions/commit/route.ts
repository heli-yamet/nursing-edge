import { learnerFromToken } from "@/lib/learner-auth";
import { readLearnerSessionToken } from "@/lib/learner-cookie";
import { learnerEntryStep } from "@/lib/learner-entry";
import {
  commitLearnerAnswer,
  readLearnerCommittedPosition,
} from "@/lib/mongo-commit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorizedLearnerId(): Promise<
  { learnerId: string } | { response: Response }
> {
  const learner = await learnerFromToken(await readLearnerSessionToken());
  if (!learner) {
    return {
      response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }
  if (learnerEntryStep(learner) !== "home") {
    return {
      response: Response.json(
        { ok: false, error: "entry_incomplete" },
        { status: 409 },
      ),
    };
  }
  return { learnerId: learner.learner_id };
}

function commitResponse(
  outcome: Awaited<ReturnType<typeof commitLearnerAnswer>>,
): Response {
  switch (outcome.result) {
    case "committed":
      return Response.json(
        {
          ok: true,
          result: "committed",
          reveal: outcome.reveal,
          is_last: outcome.isLast,
        },
        { status: 201 },
      );
    case "replay":
      return Response.json(
        {
          ok: true,
          result: "replay",
          reveal: outcome.reveal,
          is_last: outcome.isLast,
        },
        { status: 200 },
      );
    case "version_mismatch":
      return Response.json(
        { ok: false, result: "version_mismatch" },
        { status: 409 },
      );
    case "invalid_request":
      return Response.json(
        { ok: false, result: "invalid_request" },
        { status: 400 },
      );
    case "no_session":
      return Response.json({ ok: false, result: "no_session" }, { status: 404 });
    case "not_playable":
      return Response.json(
        { ok: false, result: "not_playable" },
        { status: 409 },
      );
    case "unavailable":
      return Response.json(
        { ok: false, result: "unavailable" },
        { status: 422 },
      );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizedLearnerId();
    if ("response" in auth) {
      return auth.response;
    }

    let body: {
      position?: unknown;
      question_version_id?: unknown;
      selected_option_ids?: unknown;
      confidence?: unknown;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    const outcome = await commitLearnerAnswer({
      learnerId: auth.learnerId,
      position: body.position,
      questionVersionId: body.question_version_id,
      selectedOptionIds: body.selected_option_ids,
      confidence: body.confidence,
    });
    return commitResponse(outcome);
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = await authorizedLearnerId();
    if ("response" in auth) {
      return auth.response;
    }

    const raw = new URL(req.url).searchParams.get("position");
    const position = raw === null ? Number.NaN : Number(raw);
    const outcome = await readLearnerCommittedPosition({
      learnerId: auth.learnerId,
      position,
    });
    switch (outcome.result) {
      case "reveal":
        return Response.json({
          ok: true,
          result: "reveal",
          reveal: outcome.reveal,
          is_last: outcome.isLast,
        });
      case "not_committed":
        return Response.json(
          { ok: false, result: "not_committed" },
          { status: 404 },
        );
      case "no_session":
        return Response.json({ ok: false, result: "no_session" }, { status: 404 });
      case "invalid_request":
        return Response.json(
          { ok: false, result: "invalid_request" },
          { status: 400 },
        );
      case "unavailable":
        return Response.json(
          { ok: false, result: "unavailable" },
          { status: 422 },
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
