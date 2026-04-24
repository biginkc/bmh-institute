import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

export default async function CourseReportPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const supabase = await createClient();

  const [
    courseRes,
    modulesRes,
    completionsRes,
    certsRes,
    accessibleUserRes,
  ] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, description, is_published")
      .eq("id", courseId)
      .maybeSingle(),
    supabase
      .from("modules")
      .select("id, title, lessons(id, is_required_for_completion)")
      .eq("course_id", courseId),
    supabase
      .from("user_lesson_completions")
      .select(
        `lesson_id, user_id, completed_at,
         lessons!inner(module_id,
           modules!inner(course_id)
         )`,
      )
      .eq("lessons.modules.course_id", courseId),
    supabase
      .from("certificates")
      .select("user_id, issued_at, certificate_number")
      .eq("course_id", courseId),
    // Learners with potential access: anyone whose role_group has access to
    // a program containing this course OR to this course directly.
    supabase
      .from("profiles")
      .select("id, full_name, email, system_role")
      .order("full_name"),
  ]);

  const course = courseRes.data as
    | { id: string; title: string; description: string | null; is_published: boolean }
    | null;
  if (!course) notFound();

  // Required lessons in this course.
  const requiredLessonIds = new Set<string>();
  const modules = (modulesRes.data ?? []) as Array<{
    id: string;
    title: string;
    lessons: Array<{ id: string; is_required_for_completion: boolean }> | null;
  }>;
  for (const m of modules) {
    for (const l of m.lessons ?? []) {
      if (l.is_required_for_completion) requiredLessonIds.add(l.id);
    }
  }
  const totalRequired = requiredLessonIds.size;

  // Per-user completion counts and latest activity.
  type Row = {
    userId: string;
    doneCount: number;
    latest: string | null;
  };
  const byUser = new Map<string, Row>();
  for (const c of completionsRes.data ?? []) {
    const uid = c.user_id as string;
    const lid = c.lesson_id as string;
    if (!requiredLessonIds.has(lid)) continue;
    const row = byUser.get(uid) ?? { userId: uid, doneCount: 0, latest: null };
    row.doneCount++;
    const ts = c.completed_at as string;
    if (!row.latest || ts > row.latest) row.latest = ts;
    byUser.set(uid, row);
  }

  const certByUser = new Map<
    string,
    { issued_at: string; certificate_number: string }
  >();
  for (const cert of certsRes.data ?? []) {
    certByUser.set(cert.user_id as string, {
      issued_at: cert.issued_at as string,
      certificate_number: cert.certificate_number as string,
    });
  }

  const profiles = (accessibleUserRes.data ?? []) as Array<{
    id: string;
    full_name: string;
    email: string;
    system_role: "owner" | "admin" | "learner";
  }>;

  // Only show profiles that have at least one completion OR a cert — keeps
  // the table relevant to actual progress instead of listing every auth user.
  const rows = profiles
    .filter((p) => byUser.has(p.id) || certByUser.has(p.id))
    .map((p) => {
      const stats = byUser.get(p.id) ?? {
        userId: p.id,
        doneCount: 0,
        latest: null,
      };
      const cert = certByUser.get(p.id);
      return {
        id: p.id,
        name: p.full_name || p.email,
        email: p.email,
        systemRole: p.system_role,
        doneCount: stats.doneCount,
        total: totalRequired,
        pct:
          totalRequired === 0
            ? 0
            : Math.round((stats.doneCount / totalRequired) * 100),
        latest: stats.latest,
        cert,
      };
    })
    .sort((a, b) => b.pct - a.pct || (a.name ?? "").localeCompare(b.name ?? ""));

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6 md:p-10">
      <Link
        href="/admin/reports"
        className="text-muted-foreground hover:text-foreground text-xs"
      >
        ← Back to reports
      </Link>

      <div className="mt-3 mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{course.title}</h1>
          {course.description ? (
            <p className="text-muted-foreground mt-1 text-sm">
              {course.description}
            </p>
          ) : null}
        </div>
        <Badge variant={course.is_published ? "default" : "outline"}>
          {course.is_published ? "Published" : "Draft"}
        </Badge>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatCard label="Required lessons" value={totalRequired} />
        <StatCard label="Learners with progress" value={rows.length} />
        <StatCard
          label="Certificates issued"
          value={(certsRes.data ?? []).length}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progress by learner</CardTitle>
          <CardDescription>
            Only learners with at least one completion or an issued certificate
            appear here. Click a name for their full cross-course view.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">
              No one has started this course yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Done</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/reports/users/${r.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {r.systemRole}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.doneCount} / {r.total}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.pct}%
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.cert ? r.cert.certificate_number : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.latest ? new Date(r.latest).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
