import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@/components/bmh-ds";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { shapeCourseResponse } from "@/lib/courses/shape";

import { updateCourse } from "../../actions";
import { CourseForm } from "../../course-form";
import { ModulesEditor } from "./modules-editor";

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const supabase = await createClient();

  const { data: raw } = await supabase
    .from("courses")
    .select(
      `
      id,
      title,
      description,
      is_published,
      thumbnail_path,
      content_import_id,
      thumbnail_asset_key,
      thumbnail_approved_path,
      thumbnail_approved_sha256,
      modules (
        id,
        title,
        description,
        sort_order,
        lessons (
          id,
          title,
          description,
          lesson_type,
          sort_order,
          prerequisite_lesson_id,
          quiz_id,
          assignment_id,
          is_required_for_completion
        )
      )
    `,
    )
    .eq("id", courseId)
    .maybeSingle();

  const shaped = shapeCourseResponse(raw);
  if (!shaped) notFound();

  const boundAction = updateCourse.bind(null, courseId);

  return (
    <main className="w-full flex-1 px-5 py-8 md:px-7 md:pb-16">
      <Link
        href="/admin/courses"
        className="font-[family-name:var(--font-body)] text-sm font-bold text-[var(--action)] transition-colors hover:text-[var(--action-hover)]"
      >
        ← Back to courses
      </Link>
      <div className="mb-7 mt-3">
        <PageHeader
          title={shaped.title}
          description="Update course details, add modules and arrange lessons."
          breadcrumb={[{ label: "Admin" }, { label: "Courses" }]}
        />
      </div>

      <div className="flex flex-col gap-5">
        <Card padding="md">
          <PanelHeading
            title="Details"
            description="Title, description and publish state."
          />
          <CourseForm
            entityId={courseId}
            action={boundAction}
            submitLabel="Save changes"
            defaults={{
              title: shaped.title,
              description: shaped.description,
              is_published: shaped.is_published,
              thumbnail_path: shaped.thumbnail_path,
              content_import_id: shaped.content_import_id,
              thumbnail_asset_key: shaped.thumbnail_asset_key,
              thumbnail_approved_path: shaped.thumbnail_approved_path,
              thumbnail_approved_sha256: shaped.thumbnail_approved_sha256,
            }}
          />
        </Card>

        <Card padding="md">
          <PanelHeading
            title="Modules"
            description="Arrange modules and their lessons in learner order."
          />
          <ModulesEditor courseId={courseId} modules={shaped.modules} />
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
