import { adminUsers } from "@/lib/admin-auth";
import type { AdminStatus, AdminUser } from "@/lib/admin-types";

export type AdminAccountRow = {
  admin_id: string;
  email: string;
  status: AdminStatus;
  created_at: string;
};

export async function listPendingAdminAccounts(): Promise<AdminAccountRow[]> {
  const users = await adminUsers();
  const rows = await users
    .find(
      { role: "ADMIN", status: "PENDING" },
      {
        projection: {
          _id: 0,
          admin_id: 1,
          email: 1,
          status: 1,
          created_at: 1,
        },
      },
    )
    .sort({ created_at: 1 })
    .toArray();
  return rows.map((row) => ({
    admin_id: row.admin_id,
    email: row.email,
    status: row.status,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }));
}

export type AdminAccountDecision =
  | { ok: true; email: string; status: AdminStatus }
  | { ok: false; reason: string };

export async function decideAdminAccount(input: {
  adminId: string;
  decision: "approve" | "reject";
  actorAdminId: string;
}): Promise<AdminAccountDecision> {
  const trimmedId = input.adminId.trim();
  if (!trimmedId) {
    return { ok: false, reason: "Choose an admin account." };
  }
  if (input.actorAdminId === trimmedId) {
    return { ok: false, reason: "You cannot change your own account here." };
  }

  const users = await adminUsers();
  const target = await users.findOne({ admin_id: trimmedId });
  if (!target) {
    return { ok: false, reason: "That admin account was not found." };
  }
  if (target.role !== "ADMIN") {
    return {
      ok: false,
      reason: "Only standard admin accounts can be approved here.",
    };
  }
  if (target.status !== "PENDING") {
    return {
      ok: false,
      reason: `That account is already ${target.status.toLowerCase()}.`,
    };
  }

  const nextStatus: AdminStatus =
    input.decision === "approve" ? "ACTIVE" : "REJECTED";
  const now = new Date();
  await users.updateOne(
    { admin_id: trimmedId },
    { $set: { status: nextStatus, updated_at: now } },
  );

  return { ok: true, email: target.email, status: nextStatus };
}

export function toPublicAdminRow(user: AdminUser): AdminAccountRow {
  return {
    admin_id: user.admin_id,
    email: user.email,
    status: user.status,
    created_at:
      user.created_at instanceof Date
        ? user.created_at.toISOString()
        : String(user.created_at),
  };
}