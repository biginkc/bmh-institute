/**
 * Email-based admin allowlist.
 *
 * BMH Institute is invite-only: the `invites` table gates account
 * creation, so no email domain restriction is needed (VAs outside BMH's
 * Workspace can still be invited). This file only answers the narrower
 * question of "is this email considered an admin" — used to promote a
 * profile's `system_role` on first sign-in and to gate admin-only routes.
 */

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS ?? "jarrad@bmhgroup.com";
  const admins = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}
