import { findAdminByEmail } from "@/lib/admin-auth";
import { jsonWithAdminCors } from "@/lib/admin-http";
import { verifyAdminToken } from "@/lib/admin-session";
import type { AdminUser } from "@/lib/admin-types";

export async function requireActiveAdmin(
  req: Request,
): Promise<
  | { ok: true; admin: AdminUser }
  | { ok: false; response: Response }
> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = token ? verifyAdminToken(token) : null;
  if (!payload) {
    return {
      ok: false,
      response: jsonWithAdminCors(
        req,
        { ok: false, error: "unauthorized" },
        401,
      ),
    };
  }

  const user = await findAdminByEmail(payload.email);
  if (!user || user.status !== "ACTIVE" || user.admin_id !== payload.admin_id) {
    return {
      ok: false,
      response: jsonWithAdminCors(
        req,
        { ok: false, error: "unauthorized" },
        401,
      ),
    };
  }

  return { ok: true, admin: user };
}
