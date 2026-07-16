import { redirect } from "next/navigation";
import { CalendarDays, Mail, ShieldCheck, UsersRound } from "lucide-react";

import { Badge } from "@/components/bmh-ds/badge";
import { Card } from "@/components/bmh-ds/card";
import { createClient } from "@/lib/supabase/server";

import { ChangePasswordForm, UpdateNameForm } from "./profile-forms";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, system_role, status, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const { data: roleGroups } = await supabase
    .from("user_role_groups")
    .select("role_groups(id, name)")
    .eq("user_id", user.id);

  const groups = (roleGroups ?? [])
    .map((r) => firstRow(r.role_groups))
    .filter(
      (rg): rg is { id: string; name: string } => !!rg && typeof rg.id === "string",
    );

  const fullName = (profile?.full_name as string) ?? user.email ?? "";
  const email = (profile?.email as string) ?? user.email ?? "";
  const systemRole = (profile?.system_role as string) ?? "learner";
  const status = (profile?.status as string) ?? "active";
  const joined = profile?.created_at
    ? new Date(profile.created_at as string).toLocaleDateString()
    : null;

  return (
    <main className="mx-auto w-full max-w-[760px] flex-1 px-5 py-8 md:px-7 md:py-10">
      <div className="mb-7">
        <p className="font-[family-name:var(--font-body)] text-[11px] font-extrabold tracking-[0.1em] text-[var(--text-muted)] uppercase">
          Account
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl leading-tight font-extrabold tracking-[-0.01em] text-[var(--ink-900)]">
          Your profile
        </h1>
        <p className="mt-1.5 font-[family-name:var(--font-body)] text-base font-semibold text-[var(--text-muted)]">
          Check your account details, update your certificate name, or change
          your password.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <Card padding="md">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink-900)]">
            Your details
          </h2>
          <p className="mt-1 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
            Email and role are managed by your admin and can&apos;t be changed
            here.
          </p>
          <div className="mt-5 divide-y divide-[var(--border-hairline)] font-[family-name:var(--font-body)]">
            <Row
              icon={<Mail aria-hidden="true" size={18} />}
              label="Email"
              value={email}
            />
            <Row
              icon={<ShieldCheck aria-hidden="true" size={18} />}
              label="Role"
              value={<Badge tone="blue">{capitalize(systemRole)}</Badge>}
            />
            <Row
              icon={<ShieldCheck aria-hidden="true" size={18} />}
              label="Status"
              value={
                <Badge tone={status === "active" ? "green" : "neutral"} dot>
                  {capitalize(status)}
                </Badge>
              }
            />
            {joined ? (
              <Row
                icon={<CalendarDays aria-hidden="true" size={18} />}
                label="Joined"
                value={joined}
              />
            ) : null}
            <Row
              icon={<UsersRound aria-hidden="true" size={18} />}
              label="Role groups"
              value={
                groups.length === 0 ? (
                  <span className="text-xs font-bold text-[var(--text-muted)]">
                    None
                  </span>
                ) : (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {groups.map((g) => (
                      <Badge key={g.id} tone="neutral" size="sm">
                        {g.name}
                      </Badge>
                    ))}
                  </div>
                )
              }
            />
          </div>
        </Card>

        <Card padding="md">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink-900)]">
            Display name
          </h2>
          <p className="mt-1 font-[family-name:var(--font-body)] text-sm font-semibold leading-relaxed text-[var(--text-muted)]">
            Use your real name before you finish training. This is the name
            admins see in reports and certificates.
          </p>
          <div className="mt-5">
            <UpdateNameForm defaultName={fullName} />
          </div>
        </Card>

        <Card padding="md">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink-900)]">
            Change password
          </h2>
          <p className="mt-1 font-[family-name:var(--font-body)] text-sm font-semibold leading-relaxed text-[var(--text-muted)]">
            Use this if you can sign in but want a new password. If you are
            signed out, use the reset password link on the sign-in page.
          </p>
          <div className="mt-5">
            <ChangePasswordForm />
          </div>
        </Card>
      </div>
    </main>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <span className="flex items-center gap-2.5 text-sm font-bold text-[var(--text-muted)]">
        <span className="text-[var(--ink-400)]">{icon}</span>
        {label}
      </span>
      <span className="min-w-0 text-right text-sm font-extrabold break-words text-[var(--ink-900)]">
        {value}
      </span>
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
