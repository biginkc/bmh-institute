"use client";

import Link from "next/link";

import { Badge, Table } from "@/components/bmh-ds";

export type ProgramTableRow = {
  id: string;
  title: string;
  course_order_mode: string;
  is_published: boolean;
  courseCount: number;
};

export function ProgramsTable({ programs }: { programs: ProgramTableRow[] }) {
  return (
    <Table
      rowKey="id"
      columns={[
        { key: "title", label: "Program" },
        { key: "order", label: "Order", align: "center" },
        { key: "courseCount", label: "Courses", align: "center" },
        { key: "status", label: "Status", align: "center" },
        { key: "edit", label: "Edit", align: "right" },
      ]}
      rows={programs}
      empty="No programs yet. Create one to get started."
      cell={{
        order: (program) => (
          <Badge tone="blue" size="sm">
            {program.course_order_mode === "sequential" ? "Sequential" : "Any order"}
          </Badge>
        ),
        status: (program) => (
          <Badge tone={program.is_published ? "green" : "neutral"} size="sm">
            {program.is_published ? "Published" : "Draft"}
          </Badge>
        ),
        edit: (program) => (
          <Link
            href={`/admin/programs/${program.id}/edit`}
            aria-label={`Edit ${program.title}`}
            className="font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--action)] hover:underline"
          >
            Edit
          </Link>
        ),
      }}
    />
  );
}
