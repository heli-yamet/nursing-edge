import { runtimeRoles } from "@/lib/relationship-collections";
import type { RuntimeRoleName } from "@/lib/relationship-types";

/** Publication does not override these roles. A missing role stays eligible. */
export const PRACTICE_BARRED_ROLES = [
  "CLINICAL_SIBLING_RESERVED",
  "AP_REINFORCEMENT",
] as const satisfies readonly RuntimeRoleName[];

export function isPracticeBarredRole(role: string | null | undefined): boolean {
  return role === "CLINICAL_SIBLING_RESERVED" || role === "AP_REINFORCEMENT";
}

/** Physiology never owns a cycle. A sibling that owns a Repair or Confirmation can. */
export async function reviewOwnerBarredVersionIds(): Promise<Set<string>> {
  const rows = await (
    await runtimeRoles()
  )
    .find(
      { role: "AP_REINFORCEMENT" },
      { projection: { _id: 0, question_version_id: 1 } },
    )
    .toArray();
  return new Set(rows.map((row) => row.question_version_id));
}

export async function practiceBarredVersionIds(): Promise<Set<string>> {
  const rows = await (
    await runtimeRoles()
  )
    .find(
      { role: { $in: [...PRACTICE_BARRED_ROLES] } },
      { projection: { _id: 0, question_version_id: 1 } },
    )
    .toArray();
  return new Set(rows.map((row) => row.question_version_id));
}

export async function practiceRoleForVersion(
  questionVersionId: string,
): Promise<string | null> {
  const row = await (
    await runtimeRoles()
  ).findOne(
    { question_version_id: questionVersionId },
    { projection: { _id: 0, role: 1 } },
  );
  return row?.role ?? null;
}
