import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <main className="mx-auto w-full max-w-2xl flex-1 p-6 md:p-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Check your account details, update your certificate name, or change
          your password.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Email and role are managed by your admin and can&apos;t be changed
            here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Row label="Email" value={email} />
          <Row
            label="Role"
            value={
              <Badge variant="outline" className="capitalize">
                {systemRole}
              </Badge>
            }
          />
          <Row
            label="Status"
            value={
              <Badge
                variant={status === "active" ? "default" : "secondary"}
                className="capitalize"
              >
                {status}
              </Badge>
            }
          />
          {joined ? <Row label="Joined" value={joined} /> : null}
          <Row
            label="Role groups"
            value={
              groups.length === 0 ? (
                <span className="text-muted-foreground text-xs">None</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {groups.map((g) => (
                    <Badge key={g.id} variant="secondary">
                      {g.name}
                    </Badge>
                  ))}
                </div>
              )
            }
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Display name</CardTitle>
          <CardDescription>
            Use your real name before you finish training. This is the name
            admins see in reports and certificates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpdateNameForm defaultName={fullName} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Use this if you can sign in but want a new password. If you are
            signed out, use the reset password link on the sign-in page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
