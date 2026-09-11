import { emptyAdminCors, jsonWithAdminCors } from "@/lib/admin-http";
import { findAdminByEmail } from "@/lib/admin-auth";
import { verifyAdminToken } from "@/lib/admin-session";

export function OPTIONS(req: Request) {
  return emptyAdminCors(req);
}

export async function GET(req: Request) {
  try {
    const header = req.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = token ? verifyAdminToken(token) : null;
    if (!payload) {
      return jsonWithAdminCors(req, { ok: false }, 401);
    }

    const user = await findAdminByEmail(payload.email);
    if (!user || user.status !== "ACTIVE" || user.admin_id !== payload.admin_id) {
      return jsonWithAdminCors(req, { ok: false }, 401);
    }

    return jsonWithAdminCors(req, {
      ok: true,
      admin: {
        admin_id: user.admin_id,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return jsonWithAdminCors(req, { ok: false, error: message }, 500);
  }
}
