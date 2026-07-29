"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { sendEmail } from "@/lib/email/send";
import { renderEnrollmentEmail } from "@/lib/email/enrollment";
import { routeQaNotification } from "@/lib/email/qa-routing";
import { getAppUrl } from "@/lib/app-url";
import { normalizeReleaseControlError } from "@/lib/release-control/admin-guards";
import { createClient } from "@/lib/supabase/server";

export type SaveResult =
  | { ok: true; newProgramTitles: string[] }
  | { ok: false; error: string };

type UserSettingsInput = {
  userId: string;
  system_role: "owner" | "admin" | "learner";
  role_group_ids: string[];
};

/**
 * Saves Institute-owned role-group settings.
 *
 * Role changes fail closed until the database exposes an operation that keeps
 * Hugo's matching grant in sync without changing login status.
 */
export async function saveUserSettings(
  input: UserSettingsInput,
): Promise<SaveResult> {
  const me = await requireAdmin();
  if (me.id === input.userId && input.system_role !== "owner") {
    return {
      ok: false,
      error: "You can't downgrade your own role. You'd lock yourself out.",
    };
  }

  const supabase = await createClient();
  const roleCheck = await confirmSystemRoleIsUnchanged(supabase, input);
  if (!roleCheck.ok) return roleCheck;

  // Current role_groups so we can diff for the enrollment email.
  const { data: existingRgs, error: existingRoleGroupsError } = await supabase
    .from("user_role_groups")
    .select("role_group_id")
    .eq("user_id", input.userId);
  if (existingRoleGroupsError) {
    return { ok: false, error: existingRoleGroupsError.message };
  }
  const oldGroupIds = new Set(
    (existingRgs ?? []).map((r) => r.role_group_id as string),
  );
  const newGroupIds = new Set(input.role_group_ids);
  const addedGroupIds = input.role_group_ids.filter(
    (id) => !oldGroupIds.has(id),
  );

  // Programs accessible before this edit (so we can compute *new* programs).
  const oldProgramIds = await accessibleProgramIdsFor(
    supabase,
    Array.from(oldGroupIds),
  );
  const newProgramIds = await accessibleProgramIdsFor(
    supabase,
    Array.from(newGroupIds),
  );
  const trulyNewProgramIds = newProgramIds.filter(
    (id) => !oldProgramIds.includes(id),
  );

  const saveResult = await persistInstituteSettings(supabase, input);
  if (!saveResult.ok) return saveResult;

  let newProgramTitles: string[] = [];

  // Enrollment email, if we granted new programs.
  if (trulyNewProgramIds.length > 0 && addedGroupIds.length > 0) {
    const { data: programs } = await supabase
      .from("programs")
      .select("id, title")
      .in("id", trulyNewProgramIds);
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", input.userId)
      .maybeSingle();

    const programList = ((programs ?? []) as Array<{ id: string; title: string }>).map(
      (p) => ({ id: p.id, title: p.title }),
    );
    newProgramTitles = programList.map((p) => p.title);

    if (profile?.email && programList.length > 0) {
      const { subject, html } = renderEnrollmentEmail({
        inviteeEmail: profile.email as string,
        appUrl: getAppUrl(),
        programs: programList,
        standaloneCourses: [],
      });
      const recipient = routeQaNotification(input.userId, profile.email as string);
      if (recipient) {
        await sendEmail({
          to: recipient,
          subject,
          html,
        });
      }
    }
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${input.userId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true, newProgramTitles };
}

async function confirmSystemRoleIsUnchanged(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: UserSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: targetProfile, error: targetProfileError } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", input.userId)
    .maybeSingle();
  if (targetProfileError) {
    return { ok: false, error: targetProfileError.message };
  }
  if (!targetProfile) {
    return { ok: false, error: "User not found." };
  }
  if (targetProfile.system_role !== input.system_role) {
    return {
      ok: false,
      error:
        "This role cannot be changed safely until Institute can keep Hugo access in sync without changing login status.",
    };
  }
  return { ok: true };
}

async function persistInstituteSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: UserSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: saveErr } = await supabase.rpc("fn_set_user_role_groups", {
    p_user_id: input.userId,
    p_role_group_ids: input.role_group_ids,
  });
  if (saveErr) {
    return { ok: false, error: normalizeReleaseControlError(saveErr.message) };
  }
  return { ok: true };
}

async function accessibleProgramIdsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roleGroupIds: string[],
): Promise<string[]> {
  if (roleGroupIds.length === 0) return [];
  const { data } = await supabase
    .from("program_access")
    .select("program_id, programs(is_published)")
    .in("role_group_id", roleGroupIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of data ?? []) {
    const program = Array.isArray(row.programs)
      ? row.programs[0]
      : row.programs;
    if (program?.is_published !== true) continue;
    const id = row.program_id as string;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
