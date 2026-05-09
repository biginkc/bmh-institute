import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guard";
import { summarizePilotMonitoring } from "@/lib/pilot-monitoring/summary";
import { createClient } from "@/lib/supabase/server";

export default async function AdminReportsPage() {
  // HARDEN-01: page-level guard so a direct fetch can't bypass the layout.
  await requireAdmin();
  const supabase = await createClient();

  const [
    profilesRes,
    programsRes,
    coursesRes,
    courseCertsRes,
    programCertsRes,
    completionsRes,
    auditRes,
    quizAttemptsRes,
    submissionsRes,
    lessonCourseRes,
    userRoleGroupsRes,
    requiredLessonsRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, system_role, status"),
    supabase.from("programs").select("id, title"),
    supabase.from("courses").select("id, title"),
    supabase.from("certificates").select("user_id, course_id, issued_at"),
    supabase
      .from("program_certificates")
      .select("user_id, program_id, issued_at"),
    supabase
      .from("user_lesson_completions")
      .select("user_id, lesson_id, completed_at"),
    supabase
      .from("audit_log")
      .select("id, user_id, action, entity_type, entity_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("user_quiz_attempts")
      .select("user_id, quiz_id, passed, score, completed_at"),
    supabase
      .from("assignment_submissions")
      .select("user_id, status, submitted_at"),
    // WR-03: lesson -> module -> course mapping so the per-course "active
    // learners" count is scoped to the course rather than the org-wide
    // distinct-user total.
    supabase
      .from("lessons")
      .select("id, title, modules!inner(course_id, courses(id, title))"),
    supabase.from("user_role_groups").select("user_id, role_group_id"),
    supabase
      .from("lessons")
      .select("id, title, is_required_for_completion, modules!inner(course_id)")
      .eq("is_required_for_completion", true),
  ]);

  const profiles = (profilesRes.data ?? []) as Profile[];
  const programs = (programsRes.data ?? []) as Entity[];
  const courses = (coursesRes.data ?? []) as Entity[];
  const courseCerts = (courseCertsRes.data ?? []) as CourseCert[];
  const programCerts = (programCertsRes.data ?? []) as ProgramCert[];
  const completions = (completionsRes.data ?? []) as Completion[];
  const auditRows = (auditRes.data ?? []) as AuditRow[];
  const quizAttempts = (quizAttemptsRes.data ?? []) as QuizAttempt[];
  const submissions = (submissionsRes.data ?? []) as Submission[];
  const userRoleGroups = (userRoleGroupsRes.data ?? []) as UserRoleGroup[];
  const requiredLessons = (requiredLessonsRes.data ?? []) as RequiredLessonRow[];

  // WR-03: build a lesson_id -> course_id index. PostgREST returns the inner
  // join either as a scalar object or a one-element array depending on
  // server version, so handle both shapes.
  const lessonCourseRows = (lessonCourseRes.data ?? []) as Array<{
    id: string;
    title: string;
    modules:
      | {
          course_id: string;
          courses:
            | { id: string; title: string }
            | Array<{ id: string; title: string }>
            | null;
        }
      | Array<{
          course_id: string;
          courses:
            | { id: string; title: string }
            | Array<{ id: string; title: string }>
            | null;
        }>
      | null;
  }>;
  const courseIdByLessonId = new Map<string, string>();
  const lessonTitlesById = new Map<string, string>();
  const courseTitlesByLessonId = new Map<string, string>();
  for (const row of lessonCourseRows) {
    const moduleRow = Array.isArray(row.modules) ? row.modules[0] : row.modules;
    const courseId = moduleRow?.course_id;
    if (courseId) courseIdByLessonId.set(row.id, courseId);
    lessonTitlesById.set(row.id, row.title);
    const course = Array.isArray(moduleRow?.courses)
      ? moduleRow?.courses[0]
      : moduleRow?.courses;
    if (course?.title) courseTitlesByLessonId.set(row.id, course.title);
  }

  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  const programsById = new Map(programs.map((p) => [p.id, p.title]));
  const coursesById = new Map(courses.map((c) => [c.id, c.title]));

  const learnerStats = summarizeLearners({
    profiles,
    completions,
    courseCerts,
    programCerts,
    quizAttempts,
    submissions,
  });

  const courseStats = summarizeByCourse({
    courses,
    courseCerts,
    completions,
    courseIdByLessonId,
  });
  const programStats = summarizeByProgram({ programs, programCerts });
  const activityRows = auditRows.map((row) => ({
    id: row.id,
    ...formatActivityRow(row, {
      profilesById,
      coursesById,
      programsById,
      lessonTitlesById,
      courseTitlesByLessonId,
    }),
  }));
  const activityGroups = splitActivityRows(activityRows);
  const roleGroupIdsByUserId = new Map<string, string[]>();
  for (const row of userRoleGroups) {
    const values = roleGroupIdsByUserId.get(row.user_id) ?? [];
    values.push(row.role_group_id);
    roleGroupIdsByUserId.set(row.user_id, values);
  }
  const pilotSummary = summarizePilotMonitoring({
    now: new Date(),
    learners: profiles.map((profile) => ({
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      systemRole: profile.system_role,
      status: profile.status,
      roleGroupIds: roleGroupIdsByUserId.get(profile.id) ?? [],
    })),
    requiredLessons: requiredLessons.map((lesson) => {
      const moduleRow = Array.isArray(lesson.modules)
        ? lesson.modules[0]
        : lesson.modules;
      return {
        id: lesson.id,
        title: lesson.title,
        courseId: moduleRow?.course_id ?? "",
      };
    }),
    completions: completions.map((completion) => ({
      userId: completion.user_id,
      lessonId: completion.lesson_id,
      completedAt: completion.completed_at,
    })),
    quizAttempts: quizAttempts.map((attempt) => ({
      userId: attempt.user_id,
      passed: attempt.passed,
      score: attempt.score,
      completedAt: attempt.completed_at,
    })),
    submissions: submissions.map((submission) => ({
      userId: submission.user_id,
      status: submission.status,
      submittedAt: submission.submitted_at,
    })),
    courseCertificates: courseCerts.map((certificate) => ({
      userId: certificate.user_id,
      courseId: certificate.course_id,
      issuedAt: certificate.issued_at,
    })),
    programCertificates: programCerts.map((certificate) => ({
      userId: certificate.user_id,
      programId: certificate.program_id,
      issuedAt: certificate.issued_at,
    })),
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6 md:p-10">
      <div className="mb-6">
        <PageHeader
          title="Reports"
          description="Rollup view of who's learning what. Click a row to drill in."
          breadcrumb={[{ label: "Admin" }, { label: "Reports" }]}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Active learners"
          value={profiles.filter((p) => p.system_role === "learner").length}
        />
        <StatCard
          label="Lessons completed"
          value={completions.length}
        />
        <StatCard label="Course certs" value={courseCerts.length} />
        <StatCard label="Program certs" value={programCerts.length} />
      </div>

      <PilotMonitoringPanel summary={pilotSummary} />

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Learners</h2>
        <div className="border-border rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Lessons done</TableHead>
                <TableHead className="text-right">Course certs</TableHead>
                <TableHead className="text-right">Program certs</TableHead>
                <TableHead className="text-right">Quizzes passed</TableHead>
                <TableHead className="text-right">Submissions</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {learnerStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground text-sm">
                    No learners yet.
                  </TableCell>
                </TableRow>
              ) : (
                learnerStats.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/reports/users/${l.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {l.fullName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {l.systemRole}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.lessonsDone}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.courseCerts}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.programCerts}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.quizzesPassed}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.submissions}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {l.lastActivity
                        ? new Date(l.lastActivity).toLocaleString()
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Courses</h2>
        <div className="border-border rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="text-right">
                  Learners with completed lessons
                </TableHead>
                <TableHead className="text-right">Certificates issued</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courseStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground text-sm">
                    No courses yet.
                  </TableCell>
                </TableRow>
              ) : (
                courseStats.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/reports/courses/${c.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {c.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.activeLearners}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.completedCount}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Programs</h2>
        <div className="border-border rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Program</TableHead>
                <TableHead className="text-right">Certificates issued</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground text-sm">
                    No programs yet.
                  </TableCell>
                </TableRow>
              ) : (
                programStats.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/reports/programs/${p.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {p.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.completedCount}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
        <Card>
          <CardHeader>
            <CardTitle>Learning activity</CardTitle>
            <CardDescription>
              Learner actions first. System-generated certificate and maintenance
              events are grouped below.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {auditRows.length === 0 ? (
              <p className="text-muted-foreground p-6 text-sm">
                Nothing logged yet.
              </p>
            ) : (
              <div>
                <ActivityList
                  rows={activityGroups.learnerRows}
                  emptyCopy="No learner activity logged yet."
                />
                {activityGroups.systemRows.length > 0 ? (
                  <div className="border-border border-t">
                    <div className="px-6 pt-4">
                      <h3 className="text-sm font-medium">System events</h3>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Automated certificates, imports, and maintenance events.
                      </p>
                    </div>
                    <ActivityList rows={activityGroups.systemRows} />
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function ActivityList({
  rows,
  emptyCopy,
}: {
  rows: Array<FormattedActivityRow & { id: string }>;
  emptyCopy?: string;
}) {
  if (rows.length === 0) {
    return emptyCopy ? (
      <p className="text-muted-foreground px-6 py-4 text-sm">{emptyCopy}</p>
    ) : null;
  }

  return (
    <ol className="divide-border divide-y">
      {rows.map((row) => (
        <li key={row.id} className="px-6 py-3 text-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.actor}</span>
                <Badge variant="outline">{row.badge}</Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                <span className="text-foreground font-medium">
                  {row.label}
                </span>
                {row.detail ? `: ${row.detail}` : ""}
              </p>
            </div>
            <time className="text-muted-foreground shrink-0 text-xs">
              {new Date(row.createdAt).toLocaleString()}
            </time>
          </div>
        </li>
      ))}
    </ol>
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

function PilotMonitoringPanel({
  summary,
}: {
  summary: ReturnType<typeof summarizePilotMonitoring>;
}) {
  const actionRows = summary.rows.filter((row) =>
    ["blocked", "needs_revision", "needs_review", "not_started"].includes(
      row.statusKey,
    ),
  );

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pilot monitoring</h2>
          <p className="text-muted-foreground text-sm">
            Watch learner blockers, assignment review, progress, and certificates.
          </p>
        </div>
        <Link
          href="/admin/reports/pilot/export"
          className="text-primary text-sm font-medium underline-offset-2 hover:underline"
        >
          Export CSV
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        <PilotStat label="Needs access" value={summary.totals.blocked} />
        <PilotStat label="Needs revision" value={summary.totals.needsRevision} />
        <PilotStat label="Needs review" value={summary.totals.needsReview} />
        <PilotStat label="In progress" value={summary.totals.inProgress} />
        <PilotStat label="Certified" value={summary.totals.certified} />
      </div>
      <div className="border-border mt-4 rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Learner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Required</TableHead>
              <TableHead className="text-right">Submissions</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actionRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-sm">
                  No pilot learner blockers right now.
                </TableCell>
              </TableRow>
            ) : (
              actionRows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-muted-foreground text-xs">{row.email}</div>
                  </TableCell>
                  <TableCell>
                    <PilotStatusBadge statusKey={row.statusKey} label={row.statusLabel} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.progressLabel}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.pendingSubmissions + row.needsRevisionSubmissions}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {row.lastActivity
                      ? new Date(row.lastActivity).toLocaleString()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={row.actionHref}
                      className="text-primary text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {row.actionLabel}
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function PilotStat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent />
    </Card>
  );
}

function PilotStatusBadge({
  statusKey,
  label,
}: {
  statusKey: string;
  label: string;
}) {
  if (statusKey === "blocked" || statusKey === "needs_revision") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  if (statusKey === "needs_review") return <Badge>{label}</Badge>;
  return <Badge variant="secondary">{label}</Badge>;
}

type Profile = {
  id: string;
  email: string;
  full_name: string;
  system_role: "owner" | "admin" | "learner";
  status: "active" | "invited" | "suspended";
};

type Entity = { id: string; title: string };

type Completion = { user_id: string; lesson_id: string; completed_at: string };

type CourseCert = { user_id: string; course_id: string; issued_at: string };

type ProgramCert = {
  user_id: string;
  program_id: string;
  issued_at: string;
};

type QuizAttempt = {
  user_id: string;
  quiz_id: string;
  passed: boolean | null;
  score: number | null;
  completed_at: string | null;
};

type Submission = {
  user_id: string;
  status: "submitted" | "approved" | "needs_revision";
  submitted_at: string;
};

type UserRoleGroup = {
  user_id: string;
  role_group_id: string;
};

type RequiredLessonRow = {
  id: string;
  title: string;
  is_required_for_completion: boolean;
  modules: { course_id: string } | Array<{ course_id: string }> | null;
};

type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ActivityMaps = {
  profilesById: Map<string, ActivityProfile>;
  coursesById: Map<string, string>;
  programsById: Map<string, string>;
  lessonTitlesById: Map<string, string>;
  courseTitlesByLessonId: Map<string, string>;
};

export type FormattedActivityRow = {
  actor: string;
  label: string;
  detail: string;
  badge: string;
  createdAt: string;
};

export function splitActivityRows<T extends FormattedActivityRow>(rows: T[]) {
  const learnerRows: T[] = [];
  const systemRows: T[] = [];

  for (const row of rows) {
    if (row.actor === "System activity" || row.badge === "System") {
      systemRows.push(row);
    } else {
      learnerRows.push(row);
    }
  }

  return { learnerRows, systemRows };
}

type LearnerStat = {
  id: string;
  fullName: string;
  systemRole: string;
  lessonsDone: number;
  courseCerts: number;
  programCerts: number;
  quizzesPassed: number;
  submissions: number;
  lastActivity: string | null;
};

type ActivityProfile = Pick<Profile, "id" | "email" | "full_name" | "system_role">;

function summarizeLearners({
  profiles,
  completions,
  courseCerts,
  programCerts,
  quizAttempts,
  submissions,
}: {
  profiles: Profile[];
  completions: Completion[];
  courseCerts: CourseCert[];
  programCerts: ProgramCert[];
  quizAttempts: QuizAttempt[];
  submissions: Submission[];
}): LearnerStat[] {
  const lessonsByUser = groupCount(completions, (c) => c.user_id);
  const courseCertsByUser = groupCount(courseCerts, (c) => c.user_id);
  const programCertsByUser = groupCount(programCerts, (c) => c.user_id);
  const passedQuizzesByUser = groupCount(
    quizAttempts.filter((a) => a.passed === true),
    (a) => a.user_id,
  );
  const subsByUser = groupCount(submissions, (s) => s.user_id);

  const lastActivityByUser = new Map<string, string>();
  for (const c of completions) {
    const existing = lastActivityByUser.get(c.user_id);
    if (!existing || c.completed_at > existing) {
      lastActivityByUser.set(c.user_id, c.completed_at);
    }
  }
  for (const a of quizAttempts) {
    if (!a.completed_at) continue;
    const existing = lastActivityByUser.get(a.user_id);
    if (!existing || a.completed_at > existing) {
      lastActivityByUser.set(a.user_id, a.completed_at);
    }
  }
  for (const s of submissions) {
    const existing = lastActivityByUser.get(s.user_id);
    if (!existing || s.submitted_at > existing) {
      lastActivityByUser.set(s.user_id, s.submitted_at);
    }
  }

  return profiles
    .map((p) => ({
      id: p.id,
      fullName: p.full_name || p.email,
      systemRole: p.system_role,
      lessonsDone: lessonsByUser.get(p.id) ?? 0,
      courseCerts: courseCertsByUser.get(p.id) ?? 0,
      programCerts: programCertsByUser.get(p.id) ?? 0,
      quizzesPassed: passedQuizzesByUser.get(p.id) ?? 0,
      submissions: subsByUser.get(p.id) ?? 0,
      lastActivity: lastActivityByUser.get(p.id) ?? null,
    }))
    .sort((a, b) => {
      if (a.lastActivity && b.lastActivity) {
        return b.lastActivity.localeCompare(a.lastActivity);
      }
      if (a.lastActivity) return -1;
      if (b.lastActivity) return 1;
      return a.fullName.localeCompare(b.fullName);
    });
}

export function summarizeByCourse({
  courses,
  courseCerts,
  completions,
  courseIdByLessonId,
}: {
  courses: Entity[];
  courseCerts: CourseCert[];
  completions: Completion[];
  courseIdByLessonId: Map<string, string>;
}) {
  const certCountByCourse = groupCount(courseCerts, (c) => c.course_id);
  // WR-03: per-course active learners. A learner counts as "active" for a
  // course when they have at least one lesson completion in that course.
  // Aggregating distinct user_ids per course replaces the previous
  // org-wide distinct-user count that was rendered identically on every
  // row.
  const learnersByCourse = new Map<string, Set<string>>();
  for (const c of completions) {
    const courseId = courseIdByLessonId.get(c.lesson_id);
    if (!courseId) continue;
    let set = learnersByCourse.get(courseId);
    if (!set) {
      set = new Set<string>();
      learnersByCourse.set(courseId, set);
    }
    set.add(c.user_id);
  }
  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    activeLearners: learnersByCourse.get(c.id)?.size ?? 0,
    completedCount: certCountByCourse.get(c.id) ?? 0,
  }));
}

function summarizeByProgram({
  programs,
  programCerts,
}: {
  programs: Entity[];
  programCerts: ProgramCert[];
}) {
  const certCountByProgram = groupCount(programCerts, (c) => c.program_id);
  return programs.map((p) => ({
    id: p.id,
    title: p.title,
    completedCount: certCountByProgram.get(p.id) ?? 0,
  }));
}

function groupCount<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

export function formatActivityRow(
  row: AuditRow,
  maps: ActivityMaps,
): FormattedActivityRow {
  const profile = row.user_id ? maps.profilesById.get(row.user_id) : undefined;
  const actor = row.user_id
    ? (profile?.full_name || profile?.email || "Unknown learner")
    : "System activity";
  const lessonDetail = formatLessonDetail(row.entity_id, maps);

  switch (row.action) {
    case "lesson_completed":
      return {
        actor,
        label: "Completed lesson",
        detail: lessonDetail,
        badge: "Learning",
        createdAt: row.created_at,
      };
    case "quiz_passed": {
      const score = row.metadata?.score;
      return {
        actor,
        label: "Passed quiz",
        detail:
          typeof score === "number"
            ? `${lessonDetail} with ${score}%`
            : lessonDetail,
        badge: "Learning",
        createdAt: row.created_at,
      };
    }
    case "assignment_approved":
      return {
        actor,
        label: "Assignment approved",
        detail: lessonDetail,
        badge: "Assignment",
        createdAt: row.created_at,
      };
    case "course_certificate_issued": {
      const title = row.entity_id
        ? maps.coursesById.get(row.entity_id)
        : undefined;
      return {
        actor,
        label: "Issued course certificate",
        detail: appendDetail(title ?? "Course", certificateNumber(row)),
        badge: "Certificate",
        createdAt: row.created_at,
      };
    }
    case "program_certificate_issued": {
      const title = row.entity_id
        ? maps.programsById.get(row.entity_id)
        : undefined;
      return {
        actor,
        label: "Issued program certificate",
        detail: appendDetail(title ?? "Program", certificateNumber(row)),
        badge: "Certificate",
        createdAt: row.created_at,
      };
    }
    default:
      return {
        actor,
        label: titleize(row.action),
        detail: row.entity_type,
        badge: row.user_id ? "Activity" : "System",
        createdAt: row.created_at,
      };
  }
}

function formatLessonDetail(
  lessonId: string | null,
  maps: ActivityMaps,
): string {
  if (!lessonId) return "Lesson";
  const lessonTitle = maps.lessonTitlesById.get(lessonId) ?? "Lesson";
  const courseTitle = maps.courseTitlesByLessonId.get(lessonId);
  return courseTitle ? `${lessonTitle} in ${courseTitle}` : lessonTitle;
}

function certificateNumber(row: AuditRow): string {
  const number = row.metadata?.certificate_number;
  return typeof number === "string" ? number : "";
}

function appendDetail(primary: string, secondary: string): string {
  return secondary ? `${primary}, ${secondary}` : primary;
}

function titleize(value: string): string {
  const clean = value.replace(/_/g, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}
