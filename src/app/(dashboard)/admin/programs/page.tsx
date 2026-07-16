import Link from "next/link";
import { Plus } from "lucide-react";

import { Card } from "@/components/bmh-ds";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

import { ProgramsTable } from "./programs-table";

export default async function AdminProgramsPage() {
  const supabase = await createClient();
  const [programsRes, programCoursesRes] = await Promise.all([
    supabase
      .from("programs")
      .select("id, title, description, course_order_mode, is_published, sort_order")
      .order("sort_order"),
    supabase.from("program_courses").select("program_id"),
  ]);
  const programs = addProgramCourseCounts(
    (programsRes.data ?? []) as ProgramListRow[],
    (programCoursesRes.data ?? []) as ProgramCourseCountRow[],
  );

  return (
    <main className="w-full flex-1 px-5 py-8 md:px-7 md:pb-16">
      <div className="mb-7">
        <PageHeader
          title="Programs"
          description="Bundles of courses assigned to role groups."
          breadcrumb={[{ label: "Admin" }, { label: "Programs" }]}
          actions={
            <Link
              href="/admin/programs/new"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--bmh-radius-md)] border-[2.5px] border-transparent bg-[var(--action)] px-4 font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--text-on-brand)] shadow-[var(--bmh-shadow-sm)] transition hover:bg-[var(--action-hover)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
            >
              <Plus className="size-4" aria-hidden />
              New program
            </Link>
          }
        />
      </div>

      <Card padding="sm">
        <ProgramsTable programs={programs} />
      </Card>
    </main>
  );
}

type ProgramListRow = {
  id: string;
  title: string;
  description: string | null;
  course_order_mode: string;
  is_published: boolean;
  sort_order: number;
};

type ProgramCourseCountRow = {
  program_id: string;
};

export function addProgramCourseCounts<T extends { id: string }>(
  programs: T[],
  programCourses: ProgramCourseCountRow[],
): Array<T & { courseCount: number }> {
  const countByProgram = new Map<string, number>();
  for (const row of programCourses) {
    countByProgram.set(row.program_id, (countByProgram.get(row.program_id) ?? 0) + 1);
  }
  return programs.map((program) => ({
    ...program,
    courseCount: countByProgram.get(program.id) ?? 0,
  }));
}
