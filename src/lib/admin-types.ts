export type AdminRole = "SUPER_ADMIN" | "ADMIN";
export type AdminStatus = "PENDING" | "ACTIVE" | "REJECTED";

export type AdminUser = {
  admin_id: string;
  email: string;
  password_hash: string;
  role: AdminRole;
  status: AdminStatus;
  created_at: Date;
  updated_at: Date;
  last_sign_in_at: Date | null;
};

export type AdminUserCode = {
  email: string;
  code: string;
  last_generated: Date;
  last_tried: Date | null;
};
