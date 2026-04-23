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
import { createClient } from "@/lib/supabase/server";

export default async function AdminReportsPage() {
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
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, system_role"),
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

  const courseStats = summarizeByCourse({ courses, courseCerts, completions });
  const programStats = summarizeByProgram({ programs, programCerts });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6 md:p-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Rollup view of who&apos;s learning what. Click a row to drill in.
          (Drill-ins land in the next phase.)
        </p>
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
                    <TableCell className="font-medium">{l.fullName}</TableCell>
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
                        : "—"}
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
                    <TableCell className="font-medium">{c.title}</TableCell>
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
                    <TableCell className="font-medium">{p.title}</TableCell>
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
          <CardContent className="p-0">
            {auditRows.length === 0 ? (
              <p className="text-muted-foreground p-6 text-sm">
                Nothing logged yet.
              </p>
            ) : (
              <ol className="divide-border divide-y">
                {auditRows.map((row) => (
                  <li key={row.id} className="px-6 py-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {row.user_id
                            ? (profilesById.get(row.user_id)?.full_name ??
                              "Unknown")
                            : "System"}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {formatAction(row, {
                            coursesById,
                            programsById,
                          })}
                        </span>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {new Date(row.created_at).toLocaleString()}
                      </span>
                    </div>
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

type Profile = {
  id: string;
  email: string;
  full_name: string;
  system_role: "owner" | "admin" | "learner";
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

type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

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

function summarizeByCourse({
  courses,
  courseCerts,
  completions,
}: {
  courses: Entity[];
  courseCerts: CourseCert[];
  completions: Completion[];
}) {
  const certCountByCourse = groupCount(courseCerts, (c) => c.course_id);
  // "Active learners" approximated as distinct users with any lesson
  // completion. Finer-grained per-course counts need a lessons-to-course
  // join; skip for MVP.
  const activeLearnerCount = new Set(completions.map((c) => c.user_id)).size;
  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    activeLearners: activeLearnerCount,
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

function formatAction(
  row: AuditRow,
  maps: {
    coursesById: Map<string, string>;
    programsById: Map<string, string>;
  },
): string {
  switch (row.action) {
    case "lesson_completed":
      return "completed a lesson";
    case "quiz_passed": {
      const score = row.metadata?.score;
      return typeof score === "number"
        ? `passed a quiz with ${score}%`
        : "passed a quiz";
    }
    case "assignment_approved":
      return "had an assignment approved";
    case "course_certificate_issued": {
      const title = row.entity_id
        ? maps.coursesById.get(row.entity_id)
        : undefined;
      return title ? `earned a certificate for ${title}` : "earned a course certificate";
    }
    case "program_certificate_issued": {
      const title = row.entity_id
        ? maps.programsById.get(row.entity_id)
        : undefined;
      return title ? `earned a certificate for the ${title} program` : "earned a program certificate";
    }
    default:
      return row.action.replace(/_/g, " ");
  }
}
