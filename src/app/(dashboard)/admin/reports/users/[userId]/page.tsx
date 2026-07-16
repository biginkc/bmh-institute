import { notFound } from "next/navigation";

import { Badge, Card } from "@/components/bmh-ds";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

import { AdminDataTable } from "../../../_components/admin-data-table";
import {
  AdminPageHeader,
  AdminSectionHeading,
} from "../../../_components/admin-shell";

export default async function UserReportPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  // HARDEN-01: page-level guard so a direct fetch can't bypass the layout.
  await requireAdmin();
  const { userId } = await params;
  const supabase = await createClient();

  const [
    profileRes,
    roleGroupsRes,
    programsRes,
    courseAccessRes,
    modulesLessonsRes,
    completionsRes,
    certificatesRes,
    programCertsRes,
    attemptsRes,
    rolePlayResultsRes,
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
      .from("role_play_results")
      .select(
        `block_id, scenario_id, attempt_id, score, summary, completed_at,
         content_blocks(
           content,
           lessons(
             title,
             modules(
               courses(title)
             )
           )
         )`,
      )
      .eq("user_id", userId)
      .order("completed_at", { ascending: false }),
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
    (completionsRes.data ?? []).map((c) => c.lesson_id),
  );

  // Index required lessons per course.
  const requiredByCourse = new Map<string, Set<string>>();
  for (const m of modulesLessonsRes.data ?? []) {
    const lessons = m.lessons as
      | { id: string; is_required_for_completion: boolean }[]
      | null;
    if (!lessons) continue;
    const bucket = requiredByCourse.get(m.course_id) ?? new Set();
    for (const l of lessons) {
      if (l.is_required_for_completion) bucket.add(l.id);
    }
    requiredByCourse.set(m.course_id, bucket);
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
    (certificatesRes.data ?? []).map((c) => [c.course_id, c]),
  );
  const programCertsByProgramId = new Map(
    (programCertsRes.data ?? []).map((c) => [c.program_id, c]),
  );

  const attempts = (attemptsRes.data ?? []) as Array<{
    quiz_id: string;
    score: number | null;
    passed: boolean | null;
    completed_at: string | null;
  }>;
  const rolePlayResults = (rolePlayResultsRes.data ?? []) as RolePlayResult[];
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
  const rolePlayRows = rolePlayResults.map((result) => {
    const block = firstRow(result.content_blocks);
    const lesson = firstRow(block?.lessons);
    const courseModule = firstRow(lesson?.modules);
    const course = firstRow(courseModule?.courses);
    const title = stringOr(block?.content?.title, null) ?? result.scenario_id;
    const summaryUrl = stringOr(result.summary?.summary_url, null);

    return {
      id: result.attempt_id,
      title,
      course: course?.title ?? "-",
      score: result.score === null ? "-" : `${result.score}%`,
      completed: new Date(result.completed_at).toLocaleString(),
      summary: summaryUrl ? "Open" : "-",
      summaryUrl,
    };
  });

  return (
    <main className="w-full flex-1 p-6 md:p-10">
      <AdminPageHeader
        eyebrow="Admin · Report"
        title={profile.full_name}
        description={`${profile.email} · joined ${new Date(profile.created_at).toLocaleDateString()}`}
        backHref="/admin/reports"
        backLabel="Back to reports"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={profile.system_role === "owner" ? "solid" : profile.system_role === "admin" ? "blue" : "neutral"} size="sm">
              {profile.system_role}
            </Badge>
            <Badge tone={profile.status === "active" ? "green" : profile.status === "suspended" ? "red" : "yellow"} size="sm">
              {profile.status}
            </Badge>
            {roleGroups.map((roleGroup) => (
              <Badge key={roleGroup.id} tone="blue" size="sm">
                {roleGroup.name}
              </Badge>
            ))}
          </div>
        }
      />

      <section className="mb-8">
        <AdminSectionHeading title="Programs" />
        {accessiblePrograms.length === 0 ? (
          <p className="text-sm font-semibold text-[var(--text-muted)]">
            No program access yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {accessiblePrograms.map((program) => {
              const programCert = programCertsByProgramId.get(program.id);
              const courseRows = [...(program.program_courses ?? [])].sort(
                (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
              );
              const shapedCourseRows = courseRows.flatMap((programCourse) => {
                const course = firstRow(programCourse.courses);
                if (!course) return [];
                const { total, done, pct } = percentForCourse(course.id);
                const cert = courseCertsByCourseId.get(course.id);
                return [{
                  id: course.id,
                  title: course.title,
                  lessonsDone: `${done} / ${total}`,
                  pct,
                  certificate: cert?.certificate_number ?? (pct === 100 ? "Pending issuance" : "-"),
                }];
              });
              return (
                <Card key={program.id} padding="sm">
                  <div className="flex items-start justify-between gap-3 px-3 pt-2 pb-3">
                    <div>
                      <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--ink-900)]">
                        {program.title}
                      </h3>
                      <p className="text-xs font-semibold text-[var(--text-muted)]">
                        {program.course_order_mode === "sequential" ? "Sequential" : "Any order"}
                      </p>
                    </div>
                    {programCert ? <Badge tone="green" size="sm">Completed</Badge> : null}
                  </div>
                  <AdminDataTable
                    empty="No courses in this program."
                    columns={[
                      { key: "title", label: "Course" },
                      { key: "lessonsDone", label: "Required lessons done", align: "right", tabular: true },
                      { key: "pct", label: "%", align: "right", tabular: true, suffix: "%" },
                      { key: "certificate", label: "Certificate", muted: true },
                    ]}
                    rows={shapedCourseRows}
                  />
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {standaloneCourses.length > 0 ? (
        <section className="mb-8">
          <AdminSectionHeading title="Standalone courses" />
          <Card padding="sm">
            <AdminDataTable
              columns={[
                { key: "title", label: "Course" },
                { key: "lessons", label: "Required lessons", align: "right", tabular: true },
                { key: "pct", label: "%", align: "right", tabular: true, suffix: "%" },
              ]}
              rows={standaloneCourses.map((course) => {
                const { total, done, pct } = percentForCourse(course.id);
                return { id: course.id, title: course.title, lessons: `${done} / ${total}`, pct };
              })}
            />
          </Card>
        </section>
      ) : null}

      <section className="mb-8 grid gap-4 md:grid-cols-2">
        <Card padding="md">
          <AdminSectionHeading title="Quiz activity" description="Attempts, pass count, best score." />
          <div className="text-sm">
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
                  }, null) ?? "-"
                }
                suffix={
                  attempts.some((a) => a.score !== null) ? "%" : undefined
                }
              />
            </div>
          </div>
        </Card>
        <Card padding="md">
          <AdminSectionHeading title="Role-play activity" description="Closer Lab attempts completed from embedded lessons." />
          <div className="text-sm">
            <div className="flex flex-col gap-1">
              <Stat label="Attempts" value={rolePlayResults.length} />
              <Stat
                label="Best score"
                value={
                  rolePlayResults.reduce<number | null>((best, r) => {
                    if (r.score === null) return best;
                    return best === null ? r.score : Math.max(best, r.score);
                  }, null) ?? "-"
                }
                suffix={
                  rolePlayResults.some((r) => r.score !== null)
                    ? "%"
                    : undefined
                }
              />
            </div>
          </div>
        </Card>
        <Card padding="md">
          <AdminSectionHeading title="Certificates" description="Earned course and program certs." />
          <div className="text-sm">
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
          </div>
        </Card>
      </section>

      <section className="mb-8">
        <AdminSectionHeading title="Role-play results" />
        <Card padding="sm">
          <AdminDataTable
            minWidth="46rem"
            empty="No embedded role plays completed yet."
            columns={[
              { key: "title", label: "Role play" },
              { key: "course", label: "Course", muted: true },
              { key: "score", label: "Score", align: "right", tabular: true },
              { key: "completed", label: "Completed", muted: true },
              { key: "summary", label: "Summary", presentation: "external-link", hrefKey: "summaryUrl" },
            ]}
            rows={rolePlayRows}
          />
        </Card>
      </section>

      <section>
        <AdminSectionHeading title="Recent activity" />
        <Card padding="sm">
          <AdminDataTable
            empty="No logged activity yet."
            columns={[
              { key: "action", label: "Action" },
              { key: "createdAt", label: "When", align: "right", muted: true },
            ]}
            rows={auditRows.map((row) => ({
              id: row.id,
              action: row.action.replace(/_/g, " "),
              createdAt: new Date(row.created_at).toLocaleString(),
            }))}
          />
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

type RolePlayResult = {
  block_id: string;
  scenario_id: string;
  attempt_id: string;
  score: number | null;
  summary: { summary_url?: unknown } | null;
  completed_at: string;
  content_blocks:
    | {
        content: { title?: unknown } | null;
        lessons:
          | {
              title: string;
              modules:
                | {
                    courses:
                      | { title: string }
                      | Array<{ title: string }>
                      | null;
                  }
                | Array<{
                    courses:
                      | { title: string }
                      | Array<{ title: string }>
                      | null;
                  }>
                | null;
            }
          | Array<{
              title: string;
              modules:
                | {
                    courses:
                      | { title: string }
                      | Array<{ title: string }>
                      | null;
                  }
                | Array<{
                    courses:
                      | { title: string }
                      | Array<{ title: string }>
                      | null;
                  }>
                | null;
            }>
          | null;
      }
    | Array<{
        content: { title?: unknown } | null;
        lessons:
          | {
              title: string;
              modules:
                | {
                    courses:
                      | { title: string }
                      | Array<{ title: string }>
                      | null;
                  }
                | Array<{
                    courses:
                      | { title: string }
                      | Array<{ title: string }>
                      | null;
                  }>
                | null;
            }
          | Array<{
              title: string;
              modules:
                | {
                    courses:
                      | { title: string }
                      | Array<{ title: string }>
                      | null;
                  }
                | Array<{
                    courses:
                      | { title: string }
                      | Array<{ title: string }>
                      | null;
                  }>
                | null;
            }>
          | null;
      }>
    | null;
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

function stringOr<T extends string | null>(
  value: unknown,
  fallback: T,
): string | T {
  return typeof value === "string" ? value : fallback;
}
