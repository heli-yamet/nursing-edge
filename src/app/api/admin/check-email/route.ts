import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import {
  findAdminByEmail,
  isValidEmail,
  sendCode,
} from "@/lib/admin-auth";

export function OPTIONS(req: Request) {
  return emptyAdminCors(req);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; method?: string };
    const email = body.email ?? "";
    const method = body.method;

    if (!isValidEmail(email) || (method !== "signup" && method !== "signin")) {
      return jsonWithAdminCors(
        req,
        { check: false, code: null, error: "invalid_request" },
        400,
      );
    }

    const existing = await findAdminByEmail(email);
    const ignored =
      (method === "signup" && Boolean(existing)) ||
      (method === "signin" && !existing);

    if (ignored) {
      return jsonWithAdminCors(req, { check: false, code: null });
    }

    const code = await sendCode(email);
    return jsonWithAdminCors(req, { check: true, code });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { check: false, code: null, error: message }, 500);
  }
}
