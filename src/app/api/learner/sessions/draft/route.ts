import { learnerFromToken } from "@/lib/learner-auth";
import { readLearnerSessionToken } from "@/lib/learner-cookie";
import { learnerEntryStep } from "@/lib/learner-entry";
import { saveLearnerDraft } from "@/lib/mongo-commit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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

    const outcome = await saveLearnerDraft({
      learnerId: learner.learner_id,
      position: body.position,
      questionVersionId: body.question_version_id,
      selectedOptionIds: body.selected_option_ids,
      confidence: body.confidence,
    });

    switch (outcome.result) {
      case "saved":
        return Response.json({ ok: true, result: "saved" });
      case "committed":
        return Response.json({
          ok: true,
          result: "committed",
          reveal: outcome.reveal,
          is_last: outcome.isLast,
        });
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
