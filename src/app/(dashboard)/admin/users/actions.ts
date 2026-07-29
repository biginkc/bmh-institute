"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { normalizeReleaseControlError } from "@/lib/release-control/admin-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type InstituteRoleUpdateResponse = {
  ok?: boolean;
  code?: string;
};

const INSTITUTE_ROLE_UPDATE_ERRORS: Record<string, string> = {
  NOT_ADMIN: "Admin access required.",
  NOT_FOUND: "User not found.",
  SELF_ROLE_CHANGE: "You can't change your own role here.",
  INVALID_ROLE: "Invalid role.",
  FINAL_OWNER_GUARD: "BMH Institute must retain at least one active owner.",
};

export async function updateUserRole(input: {
  userId: string;
  system_role: "owner" | "admin" | "learner";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireAdmin();
  const targetId = input.userId.trim();
  const roleClient = createAdminClient();
  const { data, error } = await roleClient.rpc("fn_update_institute_role", {
    p_actor_id: me.id,
    p_target_id: targetId,
    p_role: input.system_role,
    p_role_group_ids: null,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as InstituteRoleUpdateResponse | null;
  if (!result?.ok) {
    return {
      ok: false,
      error:
        INSTITUTE_ROLE_UPDATE_ERRORS[result?.code ?? ""] ??
        "Role could not be updated.",
    };
  }
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
