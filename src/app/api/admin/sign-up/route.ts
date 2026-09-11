import bcrypt from "bcryptjs";
import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import {
  adminUsers,
  checkCode,
  consumeCode,
  findAdminByEmail,
  isSuperAdminEmail,
  isValidEmail,
  normalizeEmail,
  superAdminExists,
} from "@/lib/admin-auth";

export function OPTIONS(req: Request) {
  return emptyAdminCors(req);
}

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

    if (!isValidEmail(email) || password.length < 8 || !/^\d{8}$/.test(code)) {
      return jsonWithAdminCors(req, { result: "invalid_request" }, 400);
    }

    if (await findAdminByEmail(email)) {
      return jsonWithAdminCors(req, { result: "exists" });
    }

    const codeCheck = await checkCode(email, code);
    if (codeCheck.rateLimited) {
      return jsonWithAdminCors(req, { result: "code", rateLimited: true });
    }
    if (!codeCheck.ok) {
      return jsonWithAdminCors(req, { result: "code" });
    }

    const makeSuper =
      isSuperAdminEmail(email) && !(await superAdminExists());
    const now = new Date();
    const users = await adminUsers();

    await users.insertOne({
      admin_id: crypto.randomUUID(),
      email: normalizeEmail(email),
      password_hash: await bcrypt.hash(password, 12),
      role: makeSuper ? "SUPER_ADMIN" : "ADMIN",
      status: makeSuper ? "ACTIVE" : "PENDING",
      created_at: now,
      updated_at: now,
      last_sign_in_at: null,
    });

    await consumeCode(email);

    return jsonWithAdminCors(req, { result: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { result: "error", error: message }, 500);
  }
}
