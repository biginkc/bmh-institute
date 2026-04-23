"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderEnrollmentEmail } from "@/lib/email/enrollment";
import {
  parseInviteInput,
  type InviteInput,
  type ParseResult,
} from "@/lib/invites/validate";

export type InviteFormState =
  | { ok: true; email: string }
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
  const inviter = await requireAdmin();
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

  const token = randomBytes(32).toString("base64url");
  const supabase = await createClient();

  // Persist the invite first — its token is what the callback uses to apply
  // role_groups and system_role after Supabase finishes its side of the flow.
  const { error: insertError } = await supabase.from("invites").insert({
    email: parsed.value.email,
    role_group_ids: parsed.value.role_group_ids,
    system_role: parsed.value.system_role,
    token,
    invited_by: inviter.id,
  });
  if (insertError) {
    return {
      ok: false,
      error: `Couldn't record the invite: ${insertError.message}`,
    };
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
  const redirectTo = `${appUrl.replace(/\/$/, "")}/auth/callback?invite_token=${encodeURIComponent(token)}`;

  const { error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(parsed.value.email, {
      redirectTo,
      data: {
        invited_by: inviter.email,
        system_role: parsed.value.system_role,
      },
    });
  if (inviteError) {
    // Back out the invite row so a retry doesn't double up.
    await supabase.from("invites").delete().eq("token", token);
    return {
      ok: false,
      error: `Supabase rejected the invite: ${inviteError.message}`,
    };
  }

  // Send enrollment email listing the programs + standalone courses the
  // invitee will have access to. Fire-and-forget — a Resend failure or
  // missing RESEND_API_KEY shouldn't block the invite since Supabase
  // already delivered the signup link.
  await sendEnrollmentEmail({
    supabase,
    email: parsed.value.email,
    roleGroupIds: parsed.value.role_group_ids,
    appUrl,
  });

  revalidatePath("/admin/users");
  return { ok: true, email: parsed.value.email };
}

async function sendEnrollmentEmail(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  email: string;
  roleGroupIds: string[];
  appUrl: string;
}): Promise<void> {
  let programs: Array<{ id: string; title: string }> = [];
  let standaloneCourses: Array<{ id: string; title: string }> = [];

  if (input.roleGroupIds.length > 0) {
    // Programs accessible via any of the invitee's role groups.
    const { data: pRows } = await input.supabase
      .from("program_access")
      .select("programs(id, title)")
      .in("role_group_id", input.roleGroupIds);
    const seen = new Set<string>();
    for (const row of pRows ?? []) {
      const p = firstRow(row.programs);
      if (p && typeof p.id === "string" && !seen.has(p.id)) {
        seen.add(p.id);
        programs.push({ id: p.id, title: p.title as string });
      }
    }

    // Courses accessible directly via course_access AND not already in
    // one of the invitee's accessible programs.
    const { data: cRows } = await input.supabase
      .from("course_access")
      .select("courses(id, title)")
      .in("role_group_id", input.roleGroupIds);
    const courseIdsInPrograms = new Set<string>();
    if (programs.length > 0) {
      const { data: pcRows } = await input.supabase
        .from("program_courses")
        .select("course_id")
        .in(
          "program_id",
          programs.map((p) => p.id),
        );
      for (const r of pcRows ?? []) {
        courseIdsInPrograms.add(r.course_id as string);
      }
    }
    const seenC = new Set<string>();
    for (const row of cRows ?? []) {
      const c = firstRow(row.courses);
      if (!c || typeof c.id !== "string") continue;
      if (courseIdsInPrograms.has(c.id)) continue;
      if (seenC.has(c.id)) continue;
      seenC.add(c.id);
      standaloneCourses.push({ id: c.id, title: c.title as string });
    }
  }

  const { subject, html } = renderEnrollmentEmail({
    inviteeEmail: input.email,
    appUrl: input.appUrl,
    programs,
    standaloneCourses,
  });

  await sendEmail({
    to: input.email,
    subject,
    html,
  });
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
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

  // Rewrite the user's role_groups atomically: wipe and re-insert.
  const { error: delErr } = await supabase
    .from("user_role_groups")
    .delete()
    .eq("user_id", input.userId);
  if (delErr) return { ok: false, error: delErr.message };

  if (input.role_group_ids.length > 0) {
    const rows = input.role_group_ids.map((rg) => ({
      user_id: input.userId,
      role_group_id: rg,
    }));
    const { error: insErr } = await supabase
      .from("user_role_groups")
      .insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
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
