import { findLearnerByEmail, sendLearnerCode } from "@/lib/learner-auth";
import { isValidLearnerEmail } from "@/lib/learner-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; method?: string };
    const email = body.email ?? "";

    if (!isValidLearnerEmail(email) || body.method !== "signup") {
      return Response.json(
        { check: false, code: null, error: "invalid_request" },
        { status: 400 },
      );
    }

    if (await findLearnerByEmail(email)) {
      return Response.json({ check: false, code: null });
    }

    const sent = await sendLearnerCode(email);
    return Response.json({ check: true, code: sent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json(
      { check: false, code: null, error: message },
      { status: 500 },
    );
  }
}
