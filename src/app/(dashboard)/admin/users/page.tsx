import { Card } from "@/components/bmh-ds";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  shapePilotCohortRows,
} from "@/lib/pilot-cohort/status";

import { AdminPageHeader, AdminSectionHeading } from "../_components/admin-shell";
import { InviteForm } from "./invite-form";
import {
  ActiveMembersTable,
  PendingInvitesTable,
  PilotSetupTable,
} from "./users-tables";

export default async function AdminUsersPage() {
  // WR-05: page-level guard mirroring HARDEN-01's pattern on the reports
  // tree. The (dashboard)/admin/layout.tsx wraps this route with the same
  // requireAdmin() check, but defending in depth at the page boundary
  // means a direct fetch against this route file can't rely on the layout
  // having run.
  await requireAdmin();
  const supabase = await createClient();
  const [profiles, invites, roleGroups, userRoleGroups] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, system_role, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("invites")
      .select("id, email, system_role, role_group_ids, created_at, accepted_at, expires_at")
      .order("created_at", { ascending: false }),
    supabase.from("role_groups").select("id, name").order("name"),
    supabase.from("user_role_groups").select("user_id, role_group_id"),
  ]);

  const pendingInvites = (invites.data ?? []).filter(
    (i) => !i.accepted_at,
  );
  const userRoleGroupsByUserId = (userRoleGroups.data ?? []).reduce<
    Record<string, string[]>
  >((acc, row) => {
    const userId = row.user_id as string;
    const roleGroupId = row.role_group_id as string;
    acc[userId] = [...(acc[userId] ?? []), roleGroupId];
    return acc;
  }, {});
  const pilotRows = shapePilotCohortRows({
    profiles: (profiles.data ?? []).map((p) => ({
      id: p.id as string,
      email: p.email as string | null,
      full_name: p.full_name as string | null,
      system_role: p.system_role as "owner" | "admin" | "learner",
      status: p.status as "active" | "invited" | "suspended",
      created_at: p.created_at as string,
    })),
    invites: (invites.data ?? []).map((i) => ({
      id: i.id as string,
      email: i.email as string,
      system_role: i.system_role as "owner" | "admin" | "learner",
      role_group_ids: i.role_group_ids as string[] | null,
      created_at: i.created_at as string,
      accepted_at: i.accepted_at as string | null,
      expires_at: i.expires_at as string,
    })),
    userRoleGroupsByUserId,
    now: new Date(),
  });

  return (
    <main className="w-full flex-1 p-6 md:p-10">
      <AdminPageHeader
        title="Users"
        description="Learner access, invite status, and role groups."
      />

      <Card padding="sm" style={{ marginBottom: 24 }}>
        <div style={{ padding: "6px 12px 12px" }}>
          <AdminSectionHeading
            title="Learner access"
            description="Access, invite status, and next actions for assigned learning groups."
          />
        </div>
        <PilotSetupTable rows={pilotRows} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <Card padding="sm">
          <div style={{ padding: "6px 12px 12px" }}>
            <AdminSectionHeading
              title="Active members"
              description="Everyone with an auth account. Role and status shown."
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
            title="Invite someone"
            description="They get a Supabase email with a signup link."
          />
          <InviteForm
            roleGroups={(roleGroups.data ?? []).map((rg) => ({
              id: rg.id as string,
              name: rg.name as string,
            }))}
          />
        </Card>
      </div>

      <Card padding="sm" style={{ marginTop: 24 }}>
        <div style={{ padding: "6px 12px 12px" }}>
          <AdminSectionHeading
            title="Pending invites"
            description="Haven't been accepted yet. Revoke to remove from the list."
          />
        </div>
        <PendingInvitesTable
          rows={pendingInvites.map((invite) => ({
            id: invite.id as string,
            email: invite.email as string,
            systemRole: invite.system_role as string,
            expiresAt: invite.expires_at as string,
          }))}
        />
      </Card>
    </main>
  );
}
