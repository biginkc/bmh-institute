import { Card } from "@/components/bmh-ds";
import { createClient } from "@/lib/supabase/server";

import { AdminPageHeader, AdminSectionHeading } from "../_components/admin-shell";
import { RoleGroupsEditor } from "./role-groups-editor";

export default async function AdminRoleGroupsPage() {
  const supabase = await createClient();
  const { data: groups } = await supabase
    .from("role_groups")
    .select("id, name, description")
    .order("name");

  return (
    <main className="w-full flex-1 p-6 md:p-10">
      <AdminPageHeader
        title="Role groups"
        description="Custom groupings of team members. Assign programs and courses to role groups to control which learners see what."
      />

      <Card padding="sm">
        <div style={{ padding: "6px 12px 12px" }}>
          <AdminSectionHeading
            title="All role groups"
            description="Rename inline. Deleting removes the group and all its learner assignments and access grants."
          />
        </div>
        <RoleGroupsEditor
          initial={(groups ?? []).map((g) => ({
            id: g.id as string,
            name: g.name as string,
            description: (g.description as string | null) ?? null,
          }))}
        />
      </Card>
    </main>
  );
}
