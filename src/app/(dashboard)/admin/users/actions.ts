"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { normalizeReleaseControlError } from "@/lib/release-control/admin-guards";
import { createClient } from "@/lib/supabase/server";

export async function updateUserRole(input: {
  userId: string;
  system_role: "owner" | "admin" | "learner";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireAdmin();
  if (me.id === input.userId && input.system_role !== "owner") {
    // Owners can't demote themselves by accident. That could leave the
    // organization without an administrator.
    return { ok: false, error: "You can't change your own role here." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ system_role: input.system_role })
    .eq("id", input.userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserRoleGroups(input: {
  userId: string;
  role_group_ids: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("fn_set_user_role_groups", {
    p_user_id: input.userId,
    p_role_group_ids: input.role_group_ids,
  });
  if (error) {
    return { ok: false, error: normalizeReleaseControlError(error.message) };
  }

  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
  return { ok: true };
}
