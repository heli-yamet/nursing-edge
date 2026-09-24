import { clearLearnerSession } from "@/lib/learner-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await clearLearnerSession();
  return Response.json({ ok: true });
}
