import Link from "next/link";

import { Card } from "@/components/bmh-ds";
import { PageHeader } from "@/components/page-header";

import { CourseForm } from "../course-form";
import { createCourse } from "../actions";

export default function NewCoursePage() {
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-5 py-8 md:px-7 md:pb-16">
      <Link
        href="/admin/courses"
        className="font-[family-name:var(--font-body)] text-sm font-bold text-[var(--action)] transition-colors hover:text-[var(--action-hover)]"
      >
        ← Back to courses
      </Link>
      <div className="mb-7 mt-3">
        <PageHeader
          title="New course"
          description="Create the course first, then add its modules and lessons."
          breadcrumb={[{ label: "Admin" }, { label: "Courses" }]}
        />
      </div>
      <Card padding="md">
        <CourseForm action={createCourse} submitLabel="Create course" />
      </Card>
    </main>
  );
}
