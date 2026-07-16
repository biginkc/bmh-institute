"use client";

import Link from "next/link";

import { Badge, Table } from "@/components/bmh-ds";

export type CourseTableRow = {
  id: string;
  title: string;
  is_published: boolean;
  moduleCount: number;
  lessonCount: number;
};

export function CoursesTable({ courses }: { courses: CourseTableRow[] }) {
  return (
    <Table
      rowKey="id"
      columns={[
        { key: "title", label: "Course" },
        { key: "moduleCount", label: "Modules", align: "center" },
        { key: "lessonCount", label: "Lessons", align: "center" },
        { key: "status", label: "Status", align: "center" },
        { key: "edit", label: "Edit", align: "right" },
      ]}
      rows={courses}
      empty="No courses yet."
      cell={{
        status: (course) => (
          <Badge tone={course.is_published ? "green" : "neutral"} size="sm">
            {course.is_published ? "Published" : "Draft"}
          </Badge>
        ),
        edit: (course) => (
          <Link
            href={`/admin/courses/${course.id}/edit`}
            aria-label={`Edit ${course.title}`}
            className="font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--action)] hover:underline"
          >
            Edit
          </Link>
        ),
      }}
    />
  );
}
