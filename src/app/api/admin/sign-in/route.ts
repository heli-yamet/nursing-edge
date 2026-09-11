import bcrypt from "bcryptjs";
import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import {
  adminUsers,
  checkCode,
  consumeCode,
  findAdminByEmail,
  isValidEmail,
} from "@/lib/admin-auth";
import { createAdminToken } from "@/lib/admin-session";

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

    if (!isValidEmail(email) || !password || !/^\d{8}$/.test(code)) {
      return jsonWithAdminCors(req, { result: "invalid_request" }, 400);
    }

    const user = await findAdminByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return jsonWithAdminCors(req, { result: "credentials" });
    }

    const codeCheck = await checkCode(email, code);
    if (codeCheck.rateLimited) {
      return jsonWithAdminCors(req, { result: "code", rateLimited: true });
    }
    if (!codeCheck.ok) {
      return jsonWithAdminCors(req, { result: "code" });
    }

    if (user.status !== "ACTIVE") {
      return jsonWithAdminCors(req, { result: "pending" });
    }

    const users = await adminUsers();
    await users.updateOne(
      { admin_id: user.admin_id },
      { $set: { last_sign_in_at: new Date(), updated_at: new Date() } },
    );
    await consumeCode(email);

    const token = createAdminToken({
      admin_id: user.admin_id,
      email: user.email,
      role: user.role,
    });

    return jsonWithAdminCors(req, { result: "success", token });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { result: "error", error: message }, 500);
  }
}
