import { learnerEntryPath } from "@/lib/learner-entry";
import {
  checkLearnerCode,
  consumeLearnerCode,
  findLearnerByEmail,
  linkAndReadAccess,
  passwordMatches,
  sendLearnerCode,
  signInInputOk,
} from "@/lib/learner-auth";
import { setLearnerSession } from "@/lib/learner-cookie";

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

    if (!signInInputOk({ email, password, code })) {
      return Response.json({ result: "invalid_request" }, { status: 400 });
    }

    const learner = await findLearnerByEmail(email);
    if (!learner || !(await passwordMatches(learner, password))) {
      return Response.json({ result: "credentials" });
    }

    if (!learner.email_verified) {
      return Response.json({ result: "unverified" });
    }

    if (!/^\d{8}$/.test(code.trim())) {
      const sent = await sendLearnerCode(email, "signin");
      return Response.json(
        sent ? { result: "code_sent" } : { result: "wait" },
      );
    }

    const codeCheck = await checkLearnerCode(email, code);
    if (codeCheck.rateLimited) {
      return Response.json({ result: "code", rateLimited: true });
    }
    if (!codeCheck.ok) {
      return Response.json({ result: "code" });
    }

    await consumeLearnerCode(email);
    await setLearnerSession(learner);
    const access = await linkAndReadAccess(learner);
    return Response.json({
      result: "success",
      access,
      next: learnerEntryPath(learner),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ result: "error", error: message }, { status: 500 });
  }
}
