import { MongoServerError } from "mongodb";
import {
  readLearnerAccess,
  registrationGateForEmail,
} from "@/lib/learner-access";
import { learnerEntryPath } from "@/lib/learner-entry";
import {
  checkLearnerCode,
  consumeLearnerCode,
  findLearnerByEmail,
  registerVerifiedLearner,
  registrationInputOk,
} from "@/lib/learner-auth";
import { setLearnerSession } from "@/lib/learner-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      firstName?: string;
      email?: string;
      password?: string;
      code?: string;
    };
    const firstName = body.firstName ?? "";
    const email = body.email ?? "";
    const password = body.password ?? "";
    const code = body.code ?? "";

    if (!registrationInputOk({ firstName, email, password, code })) {
      return Response.json({ result: "invalid_request" }, { status: 400 });
    }

    if (await findLearnerByEmail(email)) {
      return Response.json({ result: "exists" });
    }

    if ((await registrationGateForEmail(email)) === "unpaid") {
      return Response.json({ result: "unpaid" });
    }

    const codeCheck = await checkLearnerCode(email, code);
    if (codeCheck.rateLimited) {
      return Response.json({ result: "code", rateLimited: true });
    }
    if (!codeCheck.ok) {
      return Response.json({ result: "code" });
    }

    const learner = await registerVerifiedLearner({
      firstName,
      email,
      password,
    });
    await consumeLearnerCode(email);
    await setLearnerSession(learner);
    const access = await readLearnerAccess(learner.learner_id);

    return Response.json({
      result: "success",
      access,
      next: learnerEntryPath(learner),
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return Response.json({ result: "exists" });
    }
    const message = error instanceof Error ? error.message : "server_error";
    return Response.json({ result: "error", error: message }, { status: 500 });
  }
}
