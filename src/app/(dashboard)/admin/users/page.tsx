import { Card } from "@/components/bmh-ds";
import { requireAdmin } from "@/lib/auth/guard";
import { shapeLearnerAccessRows } from "@/lib/learner-access/status";
import { createClient } from "@/lib/supabase/server";

import { AdminPageHeader, AdminSectionHeading } from "../_components/admin-shell";
import { InviteForm } from "./invite-form";
import { ActiveMembersTable, LearnerAccessTable } from "./users-tables";

export default async function AdminUsersPage() {
  // WR-05: page-level guard mirroring HARDEN-01's pattern on the reports
  // tree. The (dashboard)/admin/layout.tsx wraps this route with the same
  // requireAdmin() check, but defending in depth at the page boundary
  // means a direct fetch against this route file can't rely on the layout
  // having run.
  await requireAdmin();
  const supabase = await createClient();
  const [profiles, userRoleGroups] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, system_role, status, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("user_role_groups").select("user_id, role_group_id"),
  ]);
  const userRoleGroupsByUserId = (userRoleGroups.data ?? []).reduce<
    Record<string, string[]>
  >((acc, row) => {
    const userId = row.user_id as string;
    const roleGroupId = row.role_group_id as string;
    acc[userId] = [...(acc[userId] ?? []), roleGroupId];
    return acc;
  }, {});
  const learnerAccessRows = shapeLearnerAccessRows({
    profiles: (profiles.data ?? []).map((p) => ({
      id: p.id as string,
      email: p.email as string | null,
      full_name: p.full_name as string | null,
      system_role: p.system_role as "owner" | "admin" | "learner",
      status: p.status as "active" | "invited" | "suspended",
      created_at: p.created_at as string,
    })),
    userRoleGroupsByUserId,
  });

  return (
    <main className="w-full flex-1 p-6 md:p-10">
      <AdminPageHeader
        title="Users"
        description="Learner roles and course access."
      />

      <Card padding="sm" style={{ marginBottom: 24 }}>
        <div style={{ padding: "6px 12px 12px" }}>
          <AdminSectionHeading
            title="Learner access"
            description="Course access and next actions for assigned learning groups."
          />
        </div>
        <LearnerAccessTable rows={learnerAccessRows} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <Card padding="sm">
          <div style={{ padding: "6px 12px 12px" }}>
            <AdminSectionHeading
              title="Institute profiles"
              description="Everyone with an Institute profile. Role and account status shown."
            />
          </div>
          <ActiveMembersTable
            rows={(profiles.data ?? []).map((profile) => ({
              id: profile.id as string,
              email: profile.email as string,
              fullName: profile.full_name as string,
              systemRole: profile.system_role as string,
              status: profile.status as string,
            }))}
          />
        </Card>

        <Card padding="md">
          <AdminSectionHeading
            title="Add a person"
            description="Hugo owns account creation and Institute access."
          />
          <InviteForm />
        </Card>
      </div>
    </main>
  );
}
