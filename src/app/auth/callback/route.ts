import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeNextUrl } from "@/app/(auth)/login/sanitize-next";

/**
 * Supabase invite / magic-link / recovery callback.
 *
 * Handles:
 *   - exchangeCodeForSession so the user ends up authenticated,
 *   - applying `invite_token` (from the invite email's redirect_to) — wires
 *     up system_role + user_role_groups,
 *   - routing invite/recovery/signup to /auth/set-password.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const next = searchParams.get("next");
  const inviteToken = searchParams.get("invite_token");

  // Hugo sign-in tags its redirectTo with flow=sso (login page), so a
  // rejected/cancelled SSO attempt maps to an SSO error instead of the
  // invite one. Only the error param choice differs; the exchange/invite
  // logic is identical for both flows.
  const failureError =
    searchParams.get("flow") === "sso" ? "sso_failed" : "invite_failed";

  if (!code) {
    if (inviteToken) {
      return NextResponse.redirect(
        `${origin}/login?invite_token=${encodeURIComponent(inviteToken)}`,
      );
    }
    return NextResponse.redirect(`${origin}/login?error=${failureError}`);
  }

  const supabase = await createClient();
  const { error, data } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=${failureError}`);
  }

  if (inviteToken) {
    const result = await applyInvite({
      userId: data.session.user.id,
      token: inviteToken,
    });
    if (!result.ok && result.reason === "expired") {
      // CR-02: applyInvite runs after exchangeCodeForSession, so by the time
      // we detect expiry the auth.users row exists, the cookie session is
      // set, and the handle_new_user trigger has populated profiles with a
      // default 'learner' row. Without teardown the user could navigate
      // straight to /dashboard. Sign out clears the cookie; admin
      // deleteUser removes the auth.users row, and the FK cascade declared
      // in migration 001 cleans up profiles.
      await supabase.auth.signOut();
      try {
        const admin = createAdminClient();
        await admin.auth.admin.deleteUser(data.session.user.id);
      } catch {
        // If the service-role client is unavailable the session is at least
        // gone; an orphan auth.users row will be cleaned up out-of-band.
      }
      return NextResponse.redirect(`${origin}/login?error=invite_expired`);
    }
  }

  if (type === "invite" || type === "recovery" || type === "signup") {
    return NextResponse.redirect(`${origin}/auth/set-password`);
  }

  return NextResponse.redirect(`${origin}${sanitizeNextUrl(next)}`);
}

export type ApplyInviteResult = { ok: true } | { ok: false; reason: "expired" };

/**
 * Look up the invite by token and apply its system_role and role_group_ids
 * to the user. Uses the service-role client so RLS doesn't block the writes
 * from a learner-scoped session.
 *
 * Returns a discriminated union so the GET handler can redirect on expiry.
 * HARDEN-02 / D-02: refuses expired invites before applying any role assignment.
 */
export async function applyInvite({
  userId,
  token,
}: {
  userId: string;
  token: string;
}): Promise<ApplyInviteResult> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    // No service-role key configured yet — skip pre-assignment. The user still
    // lands with a 'learner' profile and can be upgraded by hand.
    return { ok: true };
  }

  const { data: invite } = await admin
    .from("invites")
    .select("id, system_role, role_group_ids, accepted_at, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!invite || invite.accepted_at) return { ok: true };

  // HARDEN-02 / D-02: refuse expired invites before applying any role
  // assignment. Expired tokens redirect the caller back to /login with a
  // dedicated error code. The unit test in route.test.ts pins this contract.
  if (new Date(invite.expires_at as string) <= new Date()) {
    return { ok: false, reason: "expired" };
  }

  await admin
    .from("profiles")
    .update({
      system_role: invite.system_role as "owner" | "admin" | "learner",
    })
    .eq("id", userId);

  const roleGroupIds = (invite.role_group_ids ?? []) as string[];
  if (roleGroupIds.length > 0) {
    const rows = roleGroupIds.map((rg) => ({
      user_id: userId,
      role_group_id: rg,
    }));
    await admin
      .from("user_role_groups")
      .upsert(rows, { onConflict: "user_id,role_group_id", ignoreDuplicates: true });
  }

  await admin
    .from("invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id as string);

  return { ok: true };
}
