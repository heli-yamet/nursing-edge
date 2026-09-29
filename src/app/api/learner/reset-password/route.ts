import {
  checkLearnerCode,
  consumeLearnerCode,
  findLearnerByEmail,
  resetLearnerPassword,
  resetPasswordInputOk,
  resetPasswordRequestOk,
  sendLearnerCode,
} from "@/lib/learner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      code?: string;
    };
    const email = body.email ?? "";
    const password = body.password ?? "";
    const code = body.code ?? "";
    const completing = code.trim().length > 0;

    if (completing) {
      if (!resetPasswordInputOk({ email, password, code })) {
        return Response.json({ result: "invalid_request" }, { status: 400 });
      }
    } else if (!resetPasswordRequestOk({ email })) {
      return Response.json({ result: "invalid_request" }, { status: 400 });
    }

    const learner = await findLearnerByEmail(email);
    if (!learner) {
      return Response.json({ result: "unknown" });
    }

    if (!completing) {
      const sent = await sendLearnerCode(email, "reset");
      return Response.json(sent ? { result: "code_sent" } : { result: "wait" });
    }

    const codeCheck = await checkLearnerCode(email, code);
    if (codeCheck.rateLimited) {
      return Response.json({ result: "code", rateLimited: true });
    }
    if (!codeCheck.ok) {
      return Response.json({ result: "code" });
    }

    const updated = await resetLearnerPassword(learner.learner_id, password);
    if (!updated) {
      return Response.json({ result: "unknown" });
    }

    await consumeLearnerCode(email);
    return Response.json({ result: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ result: "error", error: message }, { status: 500 });
  }
}
