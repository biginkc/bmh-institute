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

export default async function UserReportPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const supabase = await createClient();

  const [
    profileRes,
    roleGroupsRes,
    programsRes,
    courseAccessRes,
    coursesRes,
    modulesLessonsRes,
    completionsRes,
    certificatesRes,
    programCertsRes,
    attemptsRes,
    auditRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, system_role, status, created_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_role_groups")
      .select("role_groups(id, name)")
      .eq("user_id", userId),
    supabase
      .from("programs")
      .select(
        `id, title, course_order_mode, is_published,
         program_access!inner( role_group_id,
           role_groups!inner( user_role_groups!inner( user_id ) )
         ),
         program_courses( course_id, sort_order,
           courses( id, title, is_published )
         )`,
      )
      .eq(
        "program_access.role_groups.user_role_groups.user_id",
        userId,
      ),
    supabase
      .from("course_access")
      .select(
        `course_id,
         role_groups!inner( user_role_groups!inner( user_id ) ),
         courses( id, title, is_published )`,
      )
      .eq("role_groups.user_role_groups.user_id", userId),
    supabase.from("courses").select("id, title"),
    supabase
      .from("modules")
      .select("id, course_id, lessons(id, is_required_for_completion)"),
    supabase
      .from("user_lesson_completions")
      .select("lesson_id, completed_at")
      .eq("user_id", userId),
    supabase
      .from("certificates")
      .select("course_id, issued_at, certificate_number")
      .eq("user_id", userId),
    supabase
      .from("program_certificates")
      .select("program_id, issued_at, certificate_number")
      .eq("user_id", userId),
    supabase
      .from("user_quiz_attempts")
      .select("quiz_id, score, passed, completed_at")
      .eq("user_id", userId),
    supabase
      .from("audit_log")
      .select("id, action, entity_type, entity_id, metadata, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const profile = profileRes.data as Profile | null;
  if (!profile) notFound();

  const roleGroups = (roleGroupsRes.data ?? [])
    .map((r) => firstRow(r.role_groups))
    .filter(
      (rg): rg is { id: string; name: string } =>
        !!rg && typeof rg.id === "string" && typeof rg.name === "string",
    );

  const accessiblePrograms = (programsRes.data ?? []) as AccessibleProgram[];

  const standaloneCoursesFromAccess = (courseAccessRes.data ?? [])
    .map((r) => firstRow(r.courses))
    .filter(
      (c): c is { id: string; title: string; is_published: boolean } =>
        !!c && typeof c.id === "string",
    );

  const completedLessonIds = new Set(
    (completionsRes.data ?? []).map((c) => c.lesson_id as string),
  );

  // Index required lessons per course.
  const requiredByCourse = new Map<string, Set<string>>();
  for (const m of modulesLessonsRes.data ?? []) {
    const lessons = m.lessons as
      | { id: string; is_required_for_completion: boolean }[]
      | null;
    if (!lessons) continue;
    const bucket = requiredByCourse.get(m.course_id as string) ?? new Set();
    for (const l of lessons) {
      if (l.is_required_for_completion) bucket.add(l.id);
    }
    requiredByCourse.set(m.course_id as string, bucket);
  }

  function percentForCourse(courseId: string): {
    total: number;
    done: number;
    pct: number;
  } {
    const req = requiredByCourse.get(courseId) ?? new Set<string>();
    const total = req.size;
    if (total === 0) return { total: 0, done: 0, pct: 0 };
    let done = 0;
    for (const id of req) if (completedLessonIds.has(id)) done++;
    return { total, done, pct: Math.round((done / total) * 100) };
  }

  const courseCertsByCourseId = new Map(
    (certificatesRes.data ?? []).map((c) => [c.course_id as string, c]),
  );
  const programCertsByProgramId = new Map(
    (programCertsRes.data ?? []).map((c) => [c.program_id as string, c]),
  );

  const attempts = (attemptsRes.data ?? []) as Array<{
    quiz_id: string;
    score: number | null;
    passed: boolean | null;
    completed_at: string | null;
  }>;
  const auditRows = (auditRes.data ?? []) as AuditRow[];

  // Standalone courses: accessible via course_access AND not already listed
  // under any accessible program.
  const coursesInPrograms = new Set<string>();
  for (const p of accessiblePrograms) {
    for (const pc of p.program_courses ?? []) {
      const c = firstRow(pc.courses);
      if (c?.id) coursesInPrograms.add(c.id);
    }
  }
  const standaloneCourses = standaloneCoursesFromAccess.filter(
    (c) => !coursesInPrograms.has(c.id),
  );

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6 md:p-10">
      <Link
        href="/admin/reports"
        className="text-muted-foreground hover:text-foreground text-xs"
      >
        ← Back to reports
      </Link>

      <div className="mt-3 mb-8">
        <h1 className="text-2xl font-semibold">{profile.full_name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {profile.email} · joined{" "}
          {new Date(profile.created_at).toLocaleDateString()}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {profile.system_role}
          </Badge>
          <Badge
            variant={profile.status === "active" ? "default" : "secondary"}
            className="capitalize"
          >
            {profile.status}
          </Badge>
          {roleGroups.map((rg) => (
            <Badge key={rg.id} variant="secondary">
              {rg.name}
            </Badge>
          ))}
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Programs</h2>
        {accessiblePrograms.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No program access yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {accessiblePrograms.map((program) => {
              const programCert = programCertsByProgramId.get(program.id);
              const courseRows = [...(program.program_courses ?? [])].sort(
                (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
              );
              return (
                <Card key={program.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>{program.title}</CardTitle>
                        <CardDescription>
                          {program.course_order_mode === "sequential"
                            ? "Sequential"
                            : "Any order"}
                        </CardDescription>
                      </div>
                      {programCert ? (
                        <Badge>Completed</Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Course</TableHead>
                          <TableHead className="text-right">
                            Required lessons done
                          </TableHead>
                          <TableHead className="text-right">%</TableHead>
                          <TableHead>Certificate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {courseRows.map((pc) => {
                          const c = firstRow(pc.courses);
                          if (!c) return null;
                          const { total, done, pct } = percentForCourse(c.id);
                          const cert = courseCertsByCourseId.get(c.id);
                          return (
                            <TableRow key={c.id}>
                              <TableCell className="font-medium">
                                {c.title}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {done} / {total}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {pct}%
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs">
                                {cert
                                  ? cert.certificate_number
                                  : pct === 100
                                    ? "Pending issuance"
                                    : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {standaloneCourses.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Standalone courses</h2>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course</TableHead>
                    <TableHead className="text-right">Required lessons</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {standaloneCourses.map((c) => {
                    const { total, done, pct } = percentForCourse(c.id);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.title}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {done} / {total}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="mb-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quiz activity</CardTitle>
            <CardDescription>
              Attempts, pass count, best score.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="flex flex-col gap-1">
              <Stat label="Attempts" value={attempts.length} />
              <Stat
                label="Passed"
                value={attempts.filter((a) => a.passed === true).length}
              />
              <Stat
                label="Best score"
                value={
                  attempts.reduce<number | null>((best, a) => {
                    if (a.score === null) return best;
                    return best === null ? a.score : Math.max(best, a.score);
                  }, null) ?? "—"
                }
                suffix={
                  attempts.some((a) => a.score !== null) ? "%" : undefined
                }
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Certificates</CardTitle>
            <CardDescription>Earned course and program certs.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="flex flex-col gap-1">
              <Stat
                label="Course certificates"
                value={(certificatesRes.data ?? []).length}
              />
              <Stat
                label="Program certificates"
                value={(programCertsRes.data ?? []).length}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
        <Card>
          <CardContent className="p-0">
            {auditRows.length === 0 ? (
              <p className="text-muted-foreground p-6 text-sm">
                No logged activity yet.
              </p>
            ) : (
              <ol className="divide-border divide-y">
                {auditRows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
                    <span>{row.action.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

type Profile = {
  id: string;
  email: string;
  full_name: string;
  system_role: "owner" | "admin" | "learner";
  status: "active" | "invited" | "suspended";
  created_at: string;
};

type AccessibleProgram = {
  id: string;
  title: string;
  course_order_mode: "sequential" | "free";
  is_published: boolean;
  program_courses: Array<{
    course_id: string;
    sort_order: number;
    courses: { id: string; title: string; is_published: boolean } | { id: string; title: string; is_published: boolean }[] | null;
  }> | null;
};

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">
        {value}
        {suffix ?? ""}
      </span>
    </div>
  );
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
