import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const [programs, courses, profiles, certificates, pendingSubs] =
    await Promise.all([
      supabase.from("programs").select("id", { count: "exact", head: true }),
      supabase.from("courses").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("certificates")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("assignment_submissions")
        .select("id", { count: "exact", head: true })
        .eq("status", "submitted"),
    ]);

  return (
    <main className="flex-1 p-6 md:p-10">
      <div className="mb-6">
        <PageHeader
          title="Overview"
          description="Training activity, content inventory, and submissions that need attention."
          breadcrumb={[{ label: "Admin" }, { label: "Overview" }]}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Pending submissions"
          count={pendingSubs.count ?? 0}
          href="/admin/submissions"
          highlight={(pendingSubs.count ?? 0) > 0}
        />
        <StatCard
          label="Programs"
          count={programs.count ?? 0}
          href="/admin/programs"
        />
        <StatCard
          label="Courses"
          count={courses.count ?? 0}
          href="/admin/courses"
        />
        <StatCard
          label="Users"
          count={profiles.count ?? 0}
          href="/admin/users"
        />
        <StatCard
          label="Certificates issued"
          count={certificates.count ?? 0}
          href="/admin/reports"
        />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/programs/new"
            className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
          >
            New program
          </Link>
          <Link
            href="/admin/courses/new"
            className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
          >
            New course
          </Link>
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label,
  count,
  href,
  highlight,
}: {
  label: string;
  count: number;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <Card
        className={
          highlight
            ? "border-amber-400 bg-amber-50 transition-colors hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950 dark:hover:bg-amber-900"
            : "hover:bg-muted/30 transition-colors"
        }
      >
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums">
            {count}
          </CardTitle>
        </CardHeader>
        <CardContent />
      </Card>
    </Link>
  );
}
