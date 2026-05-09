import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

import { RoleGroupsEditor } from "./role-groups-editor";

export default async function AdminRoleGroupsPage() {
  const supabase = await createClient();
  const { data: groups } = await supabase
    .from("role_groups")
    .select("id, name, description")
    .order("name");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6 md:p-10">
      <div className="mb-6">
        <PageHeader
          title="Role groups"
          description="Custom groupings of team members. Assign programs and courses to role groups to control which learners see what."
          breadcrumb={[{ label: "Admin" }, { label: "Role groups" }]}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All role groups</CardTitle>
          <CardDescription>
            Rename inline. Deleting removes the group and all its learner
            assignments and access grants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RoleGroupsEditor
            initial={(groups ?? []).map((g) => ({
              id: g.id as string,
              name: g.name as string,
              description: (g.description as string | null) ?? null,
            }))}
          />
        </CardContent>
      </Card>
    </main>
  );
}
