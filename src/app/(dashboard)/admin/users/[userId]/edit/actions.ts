"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { sendEmail } from "@/lib/email/send";
import { renderEnrollmentEmail } from "@/lib/email/enrollment";
import { routeQaNotification } from "@/lib/email/qa-routing";
import { getAppUrl } from "@/lib/app-url";
import { normalizeReleaseControlError } from "@/lib/release-control/admin-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SaveResult =
  | { ok: true; newProgramTitles: string[] }
  | { ok: false; error: string };

type UserSettingsInput = {
  userId: string;
  system_role: "owner" | "admin" | "learner";
  role_group_ids: string[];
};

type InstituteRoleUpdateResponse = {
  ok?: boolean;
  code?: string;
};

const INSTITUTE_ROLE_UPDATE_ERRORS: Record<string, string> = {
  NOT_ADMIN: "Admin access required.",
  NOT_FOUND: "User not found.",
  SELF_ROLE_CHANGE:
    "You can't downgrade your own role. You'd lock yourself out.",
  INVALID_ROLE: "Invalid role.",
  ROLE_GROUP_NOT_FOUND: "One or more role groups no longer exist.",
  FINAL_OWNER_GUARD: "BMH Institute must retain at least one active owner.",
};

/**
 * Saves only Institute-owned role and role-group settings.
 *
 * PostgreSQL re-authorizes the actor and enforces self-role restrictions.
 */
export async function saveUserSettings(
  input: UserSettingsInput,
): Promise<SaveResult> {
  const me = await requireAdmin();
  const targetId = input.userId.trim();
  const supabase = await createClient();
  const roleClient = createAdminClient();

  // Current role_groups so we can diff for the enrollment email.
  const { data: existingRgs, error: existingRoleGroupsError } = await supabase
    .from("user_role_groups")
    .select("role_group_id")
    .eq("user_id", targetId);
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

  const saveResult = await persistInstituteSettings(
    roleClient,
    me.id,
    { ...input, userId: targetId },
  );
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
      .eq("id", targetId)
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
      const recipient = routeQaNotification(targetId, profile.email as string);
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
  revalidatePath(`/admin/users/${targetId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true, newProgramTitles };
}

async function persistInstituteSettings(
  roleClient: ReturnType<typeof createAdminClient>,
  actorId: string,
  input: UserSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await roleClient.rpc("fn_update_institute_role", {
    p_actor_id: actorId,
    p_target_id: input.userId,
    p_role: input.system_role,
    p_role_group_ids: input.role_group_ids,
  });
  if (error) {
    return { ok: false, error: normalizeReleaseControlError(error.message) };
  }
  const result = data as InstituteRoleUpdateResponse | null;
  if (result?.ok) return { ok: true };
  return {
    ok: false,
    error:
      INSTITUTE_ROLE_UPDATE_ERRORS[result?.code ?? ""] ??
      "User settings could not be saved.",
  };
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
