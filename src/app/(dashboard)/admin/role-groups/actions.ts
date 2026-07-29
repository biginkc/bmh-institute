"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { normalizeReleaseControlError } from "@/lib/release-control/admin-guards";
import { unreleasedImportQaRoleGroupIds } from "@/lib/release-control/qa-role-groups";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type RoleGroupAccessScope = "program" | "course";

export async function setRoleGroupAccess(input: {
  roleGroupId: string;
  scope: RoleGroupAccessScope;
  targetId: string;
  enabled: boolean;
}): Promise<ActionResult> {
  await requireAdmin();
  if (!input.roleGroupId || !input.targetId) {
    return { ok: false, error: "Role group and target are required." };
  }
  if (input.scope !== "program" && input.scope !== "course") {
    return { ok: false, error: "Choose a program or course access scope." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_set_role_group_access", {
    p_role_group_id: input.roleGroupId,
    p_scope: input.scope,
    p_target_id: input.targetId,
    p_enabled: input.enabled,
  });
  if (error) {
    return { ok: false, error: normalizeReleaseControlError(error.message) };
  }

  revalidatePath(`/admin/role-groups/${input.roleGroupId}`);
  revalidatePath("/admin/role-groups");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createRoleGroup(input: {
  name: string;
  description: string | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (name.length > 200) {
    return { ok: false, error: "Name must be at most 200 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("role_groups")
    .insert({ name, description: input.description });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/role-groups");
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateRoleGroup(input: {
  id: string;
  name: string;
  description: string | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const supabase = await createClient();
  const { data: importedPrograms, error: importedProgramsError } = await supabase
    .from("programs")
    .select("content_import_id, is_published, program_access(role_group_id)")
    .not("content_import_id", "is", null)
    .eq("is_published", false);
  if (importedProgramsError) {
    return { ok: false, error: "Couldn't verify whether this role group is importer-owned." };
  }
  const protectedRoleGroupIds = unreleasedImportQaRoleGroupIds(
    (importedPrograms ?? []) as Array<{
      content_import_id: string | null;
      is_published: boolean;
      program_access: Array<{ role_group_id: string | null }> | null;
    }>,
  );
  if (protectedRoleGroupIds.has(input.id)) {
    return { ok: false, error: IMPORT_QA_ROLE_GROUP_READ_ONLY_ERROR };
  }
  const { error } = await supabase
    .from("role_groups")
    .update({ name, description: input.description })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/role-groups");
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteRoleGroup(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: importedPrograms, error: importedProgramsError } = await supabase
    .from("programs")
    .select("content_import_id, is_published, program_access(role_group_id)")
    .not("content_import_id", "is", null)
    .eq("is_published", false);
  if (importedProgramsError) {
    return { ok: false, error: "Couldn't verify whether this role group is importer-owned." };
  }
  const protectedRoleGroupIds = unreleasedImportQaRoleGroupIds(
    (importedPrograms ?? []) as Array<{
      content_import_id: string | null;
      is_published: boolean;
      program_access: Array<{ role_group_id: string | null }> | null;
    }>,
  );
  if (protectedRoleGroupIds.has(id)) {
    return { ok: false, error: IMPORT_QA_ROLE_GROUP_READ_ONLY_ERROR };
  }
  const { error } = await supabase.from("role_groups").delete().eq("id", id);
  if (error) {
    return { ok: false, error: normalizeReleaseControlError(error.message) };
  }

  revalidatePath("/admin/role-groups");
  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
  return { ok: true };
}

const IMPORT_QA_ROLE_GROUP_READ_ONLY_ERROR =
  "Imported review role groups are read-only until the release workflow completes.";
