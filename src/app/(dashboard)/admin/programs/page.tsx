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

export default async function AdminProgramsPage() {
  const supabase = await createClient();
  const { data: programs } = await supabase
    .from("programs")
    .select("id, title, description, course_order_mode, is_published, sort_order")
    .order("sort_order");

  return (
    <main className="flex-1 p-6 md:p-10">
      <div className="mb-6">
        <PageHeader
          title="Programs"
          description="Top-level containers. Courses attach into programs."
          breadcrumb={[{ label: "Admin" }, { label: "Programs" }]}
          actions={
            <Link
              href="/admin/programs/new"
              className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
            >
              New program
            </Link>
          }
        />
      </div>

      {(programs ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No programs yet. Create one to get started.
        </p>
      ) : (
        <div className="border-border rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(programs ?? []).map((p) => (
                <TableRow key={p.id as string}>
                  <TableCell className="font-medium">
                    {p.title as string}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {p.course_order_mode === "sequential"
                        ? "Sequential"
                        : "Any order"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.is_published ? "default" : "outline"}>
                      {p.is_published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/programs/${p.id}/edit`}
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
