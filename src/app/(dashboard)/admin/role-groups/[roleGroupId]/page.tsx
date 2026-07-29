import { notFound } from "next/navigation";

import { Badge, Card } from "@/components/bmh-ds";
import { createClient } from "@/lib/supabase/server";
import { unreleasedImportQaRoleGroupIds } from "@/lib/release-control/qa-role-groups";

import { AdminPageHeader, AdminSectionHeading } from "../../_components/admin-shell";
import { RoleGroupAccessEditor } from "./role-group-access-editor";

export default async function RoleGroupAccessPage({
  params,
}: {
  params: Promise<{ roleGroupId: string }>;
}) {
  const { roleGroupId } = await params;
  const supabase = await createClient();
  const [groupRes, programsRes, coursesRes, programAccessRes, courseAccessRes, programCoursesRes, importedProgramsRes] =
    await Promise.all([
      supabase.from("role_groups").select("id, name, description").eq("id", roleGroupId).maybeSingle(),
      supabase.from("programs").select("id, title, is_published").order("title"),
      supabase.from("courses").select("id, title, is_published").order("title"),
      supabase.from("program_access").select("program_id").eq("role_group_id", roleGroupId),
      supabase.from("course_access").select("course_id").eq("role_group_id", roleGroupId),
      supabase.from("program_courses").select("program_id, course_id"),
      supabase
        .from("programs")
        .select("content_import_id, is_published, program_access(role_group_id)")
        .not("content_import_id", "is", null)
        .eq("is_published", false),
    ]);

  if (!groupRes.data) notFound();
  if (
    programsRes.error ||
    coursesRes.error ||
    programAccessRes.error ||
    courseAccessRes.error ||
    programCoursesRes.error ||
    importedProgramsRes.error
  ) {
    throw new Error("Unable to load role group access controls.");
  }

  const protectedIds = unreleasedImportQaRoleGroupIds(
    (importedProgramsRes.data ?? []) as Array<{
      content_import_id: string | null;
      is_published: boolean;
      program_access: Array<{ role_group_id: string | null }> | null;
    }>,
  );
  const protectedGroup = protectedIds.has(roleGroupId);
  const directProgramIds = new Set(
    (programAccessRes.data ?? []).map((row) => row.program_id as string),
  );
  const directCourseIds = new Set(
    (courseAccessRes.data ?? []).map((row) => row.course_id as string),
  );
  const inheritedCourseIds = new Set(
    (programCoursesRes.data ?? [])
      .filter((row) => directProgramIds.has(row.program_id as string))
      .map((row) => row.course_id as string),
  );

  return (
    <main className="w-full flex-1 p-6 md:p-10">
      <AdminPageHeader
        title={`${groupRes.data.name} access`}
        description={groupRes.data.description ?? "Choose the programs and courses this role group can access."}
        backHref="/admin/role-groups"
        backLabel="Back to role groups"
      />

      {protectedGroup ? (
        <div className="mb-5 rounded-[var(--bmh-radius-md)] border border-[var(--yellow-500)] bg-[var(--yellow-100)] px-4 py-3 text-sm font-semibold text-[var(--yellow-600)]">
          This is an importer-owned review group. Its memberships and access grants are read-only until the release workflow completes.
        </div>
      ) : null}

      <Card padding="md">
        <AdminSectionHeading
          title="Program access"
          description="A program grant unlocks its attached courses. Direct course grants are shown separately below."
        />
        <RoleGroupAccessEditor
          roleGroupId={roleGroupId}
          protectedGroup={protectedGroup}
          programs={(programsRes.data ?? []).map((row) => ({
            id: row.id as string,
            title: row.title as string,
            isPublished: row.is_published as boolean,
            direct: directProgramIds.has(row.id as string),
          }))}
          courses={(coursesRes.data ?? []).map((row) => ({
            id: row.id as string,
            title: row.title as string,
            isPublished: row.is_published as boolean,
            direct: directCourseIds.has(row.id as string),
            inherited: inheritedCourseIds.has(row.id as string),
          }))}
        />
      </Card>
    </main>
  );
}
