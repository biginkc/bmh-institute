import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@/components/bmh-ds";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

import { updateProgram } from "../../actions";
import { ProgramForm } from "../../program-form";
import { CourseAttachments } from "./course-attachments";

export default async function EditProgramPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const supabase = await createClient();

  const [{ data: program }, { data: programCourses }, { data: allCourses }] =
    await Promise.all([
      supabase
        .from("programs")
        .select(
          "id, title, description, course_order_mode, is_published, sort_order",
        )
        .eq("id", programId)
        .maybeSingle(),
      supabase
        .from("program_courses")
        .select("course_id, sort_order, courses(id, title, is_published)")
        .eq("program_id", programId)
        .order("sort_order"),
      supabase.from("courses").select("id, title, is_published").order("title"),
    ]);

  if (!program) notFound();

  const boundAction = updateProgram.bind(null, programId);

  const attached = (programCourses ?? []).map((row) => ({
    course_id: row.course_id as string,
    sort_order: row.sort_order as number,
    course: firstRow(row.courses) as
      | { id: string; title: string; is_published: boolean }
      | null,
  }));

  const attachedIds = new Set(attached.map((a) => a.course_id));
  const availableCourses = (allCourses ?? []).filter(
    (c) => !attachedIds.has(c.id as string),
  );

  return (
    <main className="mx-auto w-full max-w-[820px] flex-1 px-5 py-8 md:px-7 md:pb-16">
      <Link
        href="/admin/programs"
        className="font-[family-name:var(--font-body)] text-sm font-bold text-[var(--action)] transition-colors hover:text-[var(--action-hover)]"
      >
        ← Back to programs
      </Link>
      <div className="mb-7 mt-3">
        <PageHeader
          title={program.title as string}
          description="Set order mode and attach courses."
          breadcrumb={[{ label: "Admin" }, { label: "Programs" }]}
        />
      </div>

      <div className="flex flex-col gap-5">
        <Card padding="md">
          <PanelHeading
            title="Details"
            description="Title, description and sequencing behavior."
          />
          <ProgramForm
            action={boundAction}
            submitLabel="Save changes"
            defaults={{
              title: program.title as string,
              description: program.description as string | null,
              course_order_mode:
                (program.course_order_mode as "sequential" | "free") ?? "free",
              is_published: program.is_published as boolean,
            }}
          />
        </Card>

        <Card padding="md">
          <PanelHeading
            title="Courses in this program"
            description="Attach existing courses in the numbered order below. In sequential programs this order controls when each course unlocks."
          />
          <CourseAttachments
            programId={programId}
            attached={attached
              .filter((a) => a.course !== null)
              .map((a) => ({
                courseId: a.course_id,
                title: a.course!.title,
                isPublished: a.course!.is_published,
                sortOrder: a.sort_order,
              }))}
            available={availableCourses.map((c) => ({
              id: c.id as string,
              title: c.title as string,
              isPublished: c.is_published as boolean,
            }))}
          />
        </Card>
      </div>
    </main>
  );
}

function PanelHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink-900)]">
        {title}
      </h2>
      <p className="mt-1 font-[family-name:var(--font-body)] text-sm font-semibold leading-relaxed text-[var(--text-muted)]">
        {description}
      </p>
    </div>
  );
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
