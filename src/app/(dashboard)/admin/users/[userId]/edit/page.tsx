import { notFound } from "next/navigation";

import { Badge, Card } from "@/components/bmh-ds";
import { createClient } from "@/lib/supabase/server";
import { getAuthedProfile } from "@/lib/auth/guard";

import { AdminPageHeader, AdminSectionHeading } from "../../../_components/admin-shell";
import { UserEditForm, type RoleGroupOption } from "./user-edit-form";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const me = await getAuthedProfile();
  if (!me) notFound();

  const supabase = await createClient();
  const [profileRes, roleGroupsRes, userRoleGroupsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, system_role, status, created_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("role_groups").select("id, name").order("name"),
    supabase
      .from("user_role_groups")
      .select("role_group_id")
      .eq("user_id", userId),
  ]);

  const profile = profileRes.data as
    | {
        id: string;
        email: string;
        full_name: string;
        system_role: "owner" | "admin" | "learner";
        status: "active" | "invited" | "suspended";
        created_at: string;
      }
    | null;
  if (!profile) notFound();

  const allRoleGroups = (roleGroupsRes.data ?? []) as RoleGroupOption[];
  const currentRoleGroupIds = (userRoleGroupsRes.data ?? []).map(
    (r) => r.role_group_id as string,
  );

  const isEditingSelf = me.id === profile.id;

  return (
    <main className="w-full flex-1 p-6 md:p-10">
      <AdminPageHeader
        eyebrow="Admin · Users"
        title={profile.full_name}
        description={profile.email}
        backHref="/admin/users"
        backLabel="Back to users"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={profile.system_role === "owner" ? "solid" : profile.system_role === "admin" ? "blue" : "neutral"} size="sm">
              {profile.system_role}
            </Badge>
            <Badge tone={profile.status === "active" ? "green" : profile.status === "suspended" ? "red" : "yellow"} size="sm">
              {profile.status}
            </Badge>
            <span className="text-xs font-semibold text-[var(--text-muted)]">
              Joined {new Date(profile.created_at).toLocaleDateString()}
            </span>
          </div>
        }
      />

      <Card padding="md">
        <AdminSectionHeading
          title="Settings"
          description="Role, status, and role-group membership. Changes save together. Adding a role group that unlocks new programs sends an enrollment email to the user."
        />
        <UserEditForm
          userId={profile.id}
          initialSystemRole={profile.system_role}
          initialStatus={profile.status}
          initialRoleGroupIds={currentRoleGroupIds}
          allRoleGroups={allRoleGroups}
          canModifyRole={!isEditingSelf}
          canSuspend={!isEditingSelf}
        />
      </Card>
    </main>
  );
}
