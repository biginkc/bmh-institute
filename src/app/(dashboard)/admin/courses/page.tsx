import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCoursesPage() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title, is_published")
    .order("title");

  return (
    <main className="flex-1 p-6 md:p-10">
      <div className="mb-6">
        <PageHeader
          title="Courses"
          description="Courses can live standalone or inside one or more programs."
          breadcrumb={[{ label: "Admin" }, { label: "Courses" }]}
          actions={
            <Link
              href="/admin/courses/new"
              className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
            >
              New course
            </Link>
          }
        />
      </div>

      {(courses ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">No courses yet.</p>
      ) : (
        <div className="border-border rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(courses ?? []).map((c) => (
                <TableRow key={c.id as string}>
                  <TableCell className="font-medium">
                    {c.title as string}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.is_published ? "default" : "outline"}>
                      {c.is_published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/courses/${c.id}/edit`}
                      className="text-xs underline-offset-2 hover:underline"
                    >
                      Edit →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
