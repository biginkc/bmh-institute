"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeReleaseControlError } from "@/lib/release-control/admin-guards";
import {
  parseInviteInput,
  type InviteInput,
  type ParseResult,
} from "@/lib/invites/validate";

export type InviteFormState =
  | { ok: true; email: string; created: boolean }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
      values?: Partial<InviteInput>;
    }
  | null;

export async function inviteUser(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  await requireAdmin();
  const parsed = parseInviteInput(formData);
  if (!parsed.ok) return fieldResult(parsed, formData);

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Admin client unavailable.";
    return {
      ok: false,
      error:
        message +
        " Add SUPABASE_SERVICE_ROLE_KEY to Vercel env vars and redeploy.",
    };
  }

  const canonicalEmail = parsed.value.email.trim().toLowerCase();
  let page = 1;
  let user;
  while (!user) {
    const { data: listed, error: listError } =
      await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listError) {
      return {
        ok: false,
        error: `Couldn't check existing access: ${listError.message}`,
      };
    }

    user = listed.users.find(
      (candidate) => candidate.email?.trim().toLowerCase() === canonicalEmail,
    );
    if (user || listed.users.length < 1000) break;
    page += 1;
  }

  const created = !user;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: canonicalEmail,
      email_confirm: true,
      app_metadata: {
        system_role: parsed.value.system_role,
        provisioning_origin: "institute_admin",
      },
      user_metadata: { provisioned_by: "institute_admin" },
    });
    if (error || !data.user) {
      return {
        ok: false,
        error: `Couldn't grant Institute access: ${error?.message ?? "No user returned."}`,
      };
    }
    user = data.user;
  }

  const supabase = await createClient();
  const { error: accessError } = await supabase.rpc("fn_save_user_settings", {
    p_user_id: user.id,
    p_system_role: parsed.value.system_role,
    p_status: "active",
    p_role_group_ids: parsed.value.role_group_ids,
  });
  if (accessError) {
    if (created) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(user.id);
      if (cleanupError) {
        return {
          ok: false,
          error: `Access assignment failed and the new account couldn't be rolled back: ${cleanupError.message}`,
        };
      }
    }
    return {
      ok: false,
      error: normalizeReleaseControlError(accessError.message),
    };
  }

  revalidatePath("/admin/users");
  return { ok: true, email: canonicalEmail, created };
}

export async function revokeInvite(
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("invites").delete().eq("id", inviteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateUserRole(input: {
  userId: string;
  system_role: "owner" | "admin" | "learner";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireAdmin();
  if (me.id === input.userId && input.system_role !== "owner") {
    // Owners can't demote themselves by accident — leaves the org without an admin.
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

function fieldResult(
  parsed: Extract<ParseResult<InviteInput>, { ok: false }>,
  formData: FormData,
): InviteFormState {
  return {
    ok: false,
    error: "Fix the highlighted fields.",
    fieldErrors: parsed.errors,
    values: {
      email: String(formData.get("email") ?? ""),
      system_role:
        (formData.get("system_role") as "owner" | "admin" | "learner") ??
        "learner",
      role_group_ids: formData.getAll("role_group_ids").map((v) => String(v)),
    },
  };
}
