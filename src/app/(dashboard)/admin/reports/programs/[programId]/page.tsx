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

export default async function ProgramReportPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const supabase = await createClient();

  const [
    programRes,
    programCoursesRes,
    modulesRes,
    completionsRes,
    courseCertsRes,
    programCertsRes,
    profilesRes,
  ] = await Promise.all([
    supabase
      .from("programs")
      .select("id, title, description, course_order_mode, is_published")
      .eq("id", programId)
      .maybeSingle(),
    supabase
      .from("program_courses")
      .select("course_id, sort_order, courses(id, title, is_published)")
      .eq("program_id", programId)
      .order("sort_order"),
    supabase
      .from("modules")
      .select("id, course_id, lessons(id, is_required_for_completion)"),
    supabase
      .from("user_lesson_completions")
      .select("lesson_id, user_id, completed_at"),
    supabase
      .from("certificates")
      .select("user_id, course_id"),
    supabase
      .from("program_certificates")
      .select("user_id, certificate_number, issued_at")
      .eq("program_id", programId),
    supabase
      .from("profiles")
      .select("id, full_name, email, system_role")
      .order("full_name"),
  ]);

  const program = programRes.data as
    | {
        id: string;
        title: string;
        description: string | null;
        course_order_mode: "sequential" | "free";
        is_published: boolean;
      }
    | null;
  if (!program) notFound();

  // Courses in this program, ordered.
  const programCourses = ((programCoursesRes.data ?? []) as Array<{
    course_id: string;
    sort_order: number;
    courses: { id: string; title: string; is_published: boolean } | { id: string; title: string; is_published: boolean }[] | null;
  }>).map((row) => ({
    course_id: row.course_id,
    sort_order: row.sort_order,
    course: firstRow(row.courses),
  }));
  const programCourseIds = new Set(
    programCourses.map((pc) => pc.course_id),
  );

  // Required lessons per course in this program.
  const requiredByCourse = new Map<string, Set<string>>();
  for (const m of modulesRes.data ?? []) {
    if (!programCourseIds.has(m.course_id as string)) continue;
    const lessons = m.lessons as
      | { id: string; is_required_for_completion: boolean }[]
      | null;
    if (!lessons) continue;
    const bucket =
      requiredByCourse.get(m.course_id as string) ?? new Set<string>();
    for (const l of lessons) {
      if (l.is_required_for_completion) bucket.add(l.id);
    }
    requiredByCourse.set(m.course_id as string, bucket);
  }

  const programRequiredLessonIds = new Set<string>();
  for (const set of requiredByCourse.values()) {
    for (const id of set) programRequiredLessonIds.add(id);
  }

  // Completions filtered to this program's lessons + latest activity.
  const completionsByUser = new Map<
    string,
    { total: number; latest: string | null }
  >();
  for (const c of completionsRes.data ?? []) {
    const lid = c.lesson_id as string;
    if (!programRequiredLessonIds.has(lid)) continue;
    const uid = c.user_id as string;
    const ts = c.completed_at as string;
    const row = completionsByUser.get(uid) ?? { total: 0, latest: null };
    row.total++;
    if (!row.latest || ts > row.latest) row.latest = ts;
    completionsByUser.set(uid, row);
  }

  // Course certificates filtered to this program's courses.
  const courseCertsByUser = new Map<string, Set<string>>();
  for (const cert of courseCertsRes.data ?? []) {
    const cid = cert.course_id as string;
    if (!programCourseIds.has(cid)) continue;
    const uid = cert.user_id as string;
    const set = courseCertsByUser.get(uid) ?? new Set<string>();
    set.add(cid);
    courseCertsByUser.set(uid, set);
  }

  const programCertByUser = new Map<
    string,
    { certificate_number: string; issued_at: string }
  >();
  for (const pc of programCertsRes.data ?? []) {
    programCertByUser.set(pc.user_id as string, {
      certificate_number: pc.certificate_number as string,
      issued_at: pc.issued_at as string,
    });
  }

  const profiles = (profilesRes.data ?? []) as Array<{
    id: string;
    full_name: string;
    email: string;
    system_role: "owner" | "admin" | "learner";
  }>;

  const totalRequired = programRequiredLessonIds.size;
  const totalCourses = programCourseIds.size;

  const rows = profiles
    .filter(
      (p) =>
        completionsByUser.has(p.id) ||
        courseCertsByUser.has(p.id) ||
        programCertByUser.has(p.id),
    )
    .map((p) => {
      const completion = completionsByUser.get(p.id) ?? {
        total: 0,
        latest: null,
      };
      const certs = courseCertsByUser.get(p.id) ?? new Set<string>();
      const programCert = programCertByUser.get(p.id);
      return {
        id: p.id,
        name: p.full_name || p.email,
        email: p.email,
        systemRole: p.system_role,
        doneCount: completion.total,
        total: totalRequired,
        pct:
          totalRequired === 0
            ? 0
            : Math.round((completion.total / totalRequired) * 100),
        coursesComplete: certs.size,
        totalCourses,
        programCert,
        latest: completion.latest,
      };
    })
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6 md:p-10">
      <Link
        href="/admin/reports"
        className="text-muted-foreground hover:text-foreground text-xs"
      >
        ← Back to reports
      </Link>

      <div className="mt-3 mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{program.title}</h1>
          {program.description ? (
            <p className="text-muted-foreground mt-1 text-sm">
              {program.description}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {program.course_order_mode === "sequential"
                ? "Sequential"
                : "Any order"}
            </Badge>
            <Badge variant={program.is_published ? "default" : "outline"}>
              {program.is_published ? "Published" : "Draft"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard label="Courses" value={totalCourses} />
        <StatCard label="Required lessons" value={totalRequired} />
        <StatCard label="Learners engaged" value={rows.length} />
        <StatCard
          label="Program certs issued"
          value={(programCertsRes.data ?? []).length}
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Courses in order</CardTitle>
          <CardDescription>
            {program.course_order_mode === "sequential"
              ? "Sequential: each course unlocks after the prior one completes."
              : "Free: learners pick any order."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Course</TableHead>
                <TableHead className="text-right">Drill in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programCourses.map((pc, idx) => {
                if (!pc.course) return null;
                return (
                  <TableRow key={pc.course.id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {pc.course.title}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/reports/courses/${pc.course.id}`}
                        className="text-xs underline-offset-2 hover:underline"
                      >
                        View →
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progress by learner</CardTitle>
          <CardDescription>
            Across every required lesson in the program&apos;s courses.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">
              Nobody&apos;s started the program yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Lessons</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Courses done</TableHead>
                  <TableHead>Program cert</TableHead>
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
                    <TableCell className="text-right tabular-nums">
                      {r.doneCount} / {r.total}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.pct}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.coursesComplete} / {r.totalCourses}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.programCert
                        ? r.programCert.certificate_number
                        : "—"}
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

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
