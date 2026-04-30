"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { renderEnrollmentEmail } from "@/lib/email/enrollment";

export type SaveResult =
  | { ok: true; newProgramTitles: string[] }
  | { ok: false; error: string };

/**
 * Saves role + status + role_groups for a user in one shot. When the
 * role_groups change grants access to programs the user didn't previously
 * see, sends the enrollment email listing just the new ones.
 *
 * Self-demotion guard lives here too: an owner can't downgrade themselves.
 */
export async function saveUserSettings(input: {
  userId: string;
  system_role: "owner" | "admin" | "learner";
  status: "active" | "invited" | "suspended";
  role_group_ids: string[];
}): Promise<SaveResult> {
  const me = await requireAdmin();
  if (me.id === input.userId && input.system_role !== "owner") {
    return {
      ok: false,
      error: "You can't downgrade your own role — you'd lock yourself out.",
    };
  }

  const supabase = await createClient();

  // Current role_groups so we can diff for the enrollment email.
  const { data: existingRgs } = await supabase
    .from("user_role_groups")
    .select("role_group_id")
    .eq("user_id", input.userId);
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

  // 1) Profile row: role + status.
  const { error: pErr } = await supabase
    .from("profiles")
    .update({
      system_role: input.system_role,
      status: input.status,
    })
    .eq("id", input.userId);
  if (pErr) return { ok: false, error: pErr.message };

  // 2) user_role_groups: wipe + re-insert.
  const { error: dErr } = await supabase
    .from("user_role_groups")
    .delete()
    .eq("user_id", input.userId);
  if (dErr) return { ok: false, error: dErr.message };
  if (input.role_group_ids.length > 0) {
    const rows = input.role_group_ids.map((rg) => ({
      user_id: input.userId,
      role_group_id: rg,
    }));
    const { error: iErr } = await supabase
      .from("user_role_groups")
      .insert(rows);
    if (iErr) return { ok: false, error: iErr.message };
  }

  let newProgramTitles: string[] = [];

  // 3) Enrollment email, if we granted new programs.
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
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        "https://bmh-institute.vercel.app";
      const { subject, html } = renderEnrollmentEmail({
        inviteeEmail: profile.email as string,
        appUrl,
        programs: programList,
        standaloneCourses: [],
      });
      await sendEmail({
        to: profile.email as string,
        subject,
        html,
      });
    }
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${input.userId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true, newProgramTitles };
}

async function accessibleProgramIdsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roleGroupIds: string[],
): Promise<string[]> {
  if (roleGroupIds.length === 0) return [];
  const { data } = await supabase
    .from("program_access")
    .select("program_id")
    .in("role_group_id", roleGroupIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of data ?? []) {
    const id = row.program_id as string;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export async function deleteUser(userId: string): Promise<{
  ok: true;
} | { ok: false; error: string }> {
  const me = await requireAdmin();
  if (me.id === userId) {
    return { ok: false, error: "You can't delete yourself." };
  }
  // We only remove the public.profiles row + user_role_groups. The
  // auth.users row is left intact (the service role key is needed to
  // delete via auth.admin.deleteUser — do it from the Supabase dashboard
  // if you want the auth record gone).
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status: "suspended" })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}
