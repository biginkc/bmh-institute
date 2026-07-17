import { notFound } from "next/navigation";

import { Badge, Card } from "@/components/bmh-ds";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { loadAdminLessonCompletions } from "../../../../lesson-state-rpc";

import { AdminDataTable } from "../../../_components/admin-data-table";
import {
  AdminMetricCard,
  AdminPageHeader,
  AdminSectionHeading,
} from "../../../_components/admin-shell";
import { loadAllReportRowsById } from "../../report-source-pagination";

export default async function ProgramReportPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  // HARDEN-01: page-level guard so a direct fetch can't bypass the layout.
  await requireAdmin();
  const { programId } = await params;
  const supabase = await createClient();

  const [
    programRes,
    programCoursesResult,
    lessonsResult,
    courseCertsResult,
    programCertsResult,
    profilesResult,
  ] = await Promise.all([
    supabase
      .from("programs")
      .select("id, title, description, course_order_mode, is_published")
      .eq("id", programId)
      .maybeSingle(),
    loadAllReportRowsById(({ afterId, limit }) => {
      let query = supabase
        .from("program_courses")
        .select("id, course_id, sort_order, courses(id, title, is_published)", {
          count: "exact",
        })
        .eq("program_id", programId)
        .order("id", { ascending: true })
        .limit(limit);
      if (afterId !== null) query = query.gt("id", afterId);
      return query;
    }),
    loadAllReportRowsById<ProgramLessonRow>(({ afterId, limit }) => {
      const query = supabase
        .from("lessons")
        .select("id, is_required_for_completion, modules!inner(course_id)", {
          count: "exact",
        })
        .order("id", { ascending: true })
        .limit(limit);
      return afterId === null ? query : query.gt("id", afterId);
    }),
    loadAllReportRowsById(({ afterId, limit }) => {
      const query = supabase
        .from("certificates")
        .select("id, user_id, course_id", { count: "exact" })
        .order("id", { ascending: true })
        .limit(limit);
      return afterId === null ? query : query.gt("id", afterId);
    }),
    loadAllReportRowsById(({ afterId, limit }) => {
      let query = supabase
        .from("program_certificates")
        .select("id, user_id, certificate_number, issued_at", {
          count: "exact",
        })
        .eq("program_id", programId)
        .order("id", { ascending: true })
        .limit(limit);
      if (afterId !== null) query = query.gt("id", afterId);
      return query;
    }),
    loadAllReportRowsById(({ afterId, limit }) => {
      const query = supabase
        .from("profiles")
        .select("id, full_name, email, system_role", { count: "exact" })
        .order("id", { ascending: true })
        .limit(limit);
      return afterId === null ? query : query.gt("id", afterId);
    }),
  ]);

  if (programRes.error) {
    return (
      <main className="w-full flex-1 p-6 md:p-10">
        <AdminPageHeader
          eyebrow="Admin · Report"
          title="Program report"
          description="Report source data could not be verified. Refresh the page to try again."
          backHref="/admin/reports"
          backLabel="Back to reports"
        />
      </main>
    );
  }

  const program = programRes.data as {
    id: string;
    title: string;
    description: string | null;
    course_order_mode: "sequential" | "free";
    is_published: boolean;
  } | null;
  if (!program) notFound();
  if (
    !programCoursesResult.ok ||
    !lessonsResult.ok ||
    !courseCertsResult.ok ||
    !programCertsResult.ok ||
    !profilesResult.ok
  ) {
    return (
      <main className="w-full flex-1 p-6 md:p-10">
        <AdminPageHeader
          eyebrow="Admin · Report"
          title={program.title}
          description="Report source data could not be verified. Refresh the page to try again."
          backHref="/admin/reports"
          backLabel="Back to reports"
        />
      </main>
    );
  }

  // Courses in this program, ordered.
  const programCourses = (
    programCoursesResult.rows as Array<{
      id: string;
      course_id: string;
      sort_order: number;
      courses:
        | { id: string; title: string; is_published: boolean }
        | { id: string; title: string; is_published: boolean }[]
        | null;
    }>
  )
    .map((row) => ({
      course_id: row.course_id,
      sort_order: row.sort_order,
      course: firstRow(row.courses),
    }))
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        left.course_id.localeCompare(right.course_id),
    );
  const programCourseIds = new Set(programCourses.map((pc) => pc.course_id));

  // Required lessons per course in this program.
  const requiredByCourse = new Map<string, Set<string>>();
  for (const lesson of lessonsResult.rows) {
    const courseId = firstRow(lesson.modules)?.course_id;
    if (!courseId || !programCourseIds.has(courseId)) continue;
    const bucket = requiredByCourse.get(courseId) ?? new Set<string>();
    if (lesson.is_required_for_completion) bucket.add(lesson.id);
    requiredByCourse.set(courseId, bucket);
  }

  const programRequiredLessonIds = new Set<string>();
  for (const set of requiredByCourse.values()) {
    for (const id of set) programRequiredLessonIds.add(id);
  }

  const profiles = profilesResult.rows as ReportProfile[];
  const completionResult = await loadAdminLessonCompletions(supabase, {
    userIds: profiles.map((profile) => profile.id),
    lessonIds: Array.from(programRequiredLessonIds),
  });
  if (!completionResult.ok) {
    return (
      <main className="w-full flex-1 p-6 md:p-10">
        <AdminPageHeader
          eyebrow="Admin · Report"
          title={program.title}
          description="Current learner completion could not be verified. Refresh the page to try again."
          backHref="/admin/reports"
          backLabel="Back to reports"
        />
      </main>
    );
  }

  // Completions filtered to this program's lessons + latest activity.
  const completionsByUser = new Map<
    string,
    { total: number; latest: string | null }
  >();
  for (const completion of completionResult.completions) {
    const lid = completion.lessonId;
    if (!programRequiredLessonIds.has(lid)) continue;
    const uid = completion.userId;
    const ts = completion.completedAt;
    const row = completionsByUser.get(uid) ?? { total: 0, latest: null };
    row.total++;
    if (ts && (!row.latest || ts > row.latest)) row.latest = ts;
    completionsByUser.set(uid, row);
  }

  // Course certificates filtered to this program's courses.
  const courseCertsByUser = new Map<string, Set<string>>();
  for (const cert of courseCertsResult.rows) {
    const cid = cert.course_id;
    if (!programCourseIds.has(cid)) continue;
    const uid = cert.user_id;
    const set = courseCertsByUser.get(uid) ?? new Set<string>();
    set.add(cid);
    courseCertsByUser.set(uid, set);
  }

  const programCertByUser = new Map<
    string,
    { certificate_number: string; issued_at: string }
  >();
  for (const pc of programCertsResult.rows) {
    programCertByUser.set(pc.user_id, {
      certificate_number: pc.certificate_number,
      issued_at: pc.issued_at,
    });
  }

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
    <main className="w-full flex-1 p-6 md:p-10">
      <AdminPageHeader
        eyebrow="Admin · Report"
        title={program.title}
        description={program.description}
        backHref="/admin/reports"
        backLabel="Back to reports"
        actions={
          <div className="flex gap-2">
            <Badge tone="blue" size="sm">
              {program.course_order_mode === "sequential"
                ? "Sequential"
                : "Any order"}
            </Badge>
            <Badge tone={program.is_published ? "green" : "neutral"} size="sm">
              {program.is_published ? "Published" : "Draft"}
            </Badge>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard label="Courses" value={totalCourses} />
        <StatCard label="Required lessons" value={totalRequired} />
        <StatCard label="Learners engaged" value={rows.length} />
        <StatCard
          label="Program certs issued"
          value={programCertsResult.rows.length}
        />
      </div>

      <Card padding="sm" style={{ marginBottom: 24 }}>
        <div style={{ padding: "6px 12px 12px" }}>
          <AdminSectionHeading
            title="Courses in order"
            description={
              program.course_order_mode === "sequential"
                ? "Sequential: each course unlocks after the prior one completes."
                : "Free: learners pick any order."
            }
          />
        </div>
        <AdminDataTable
          rowKey="id"
          columns={[
            {
              key: "position",
              label: "#",
              width: "4rem",
              muted: true,
              tabular: true,
            },
            { key: "title", label: "Course" },
            {
              key: "action",
              label: "Drill in",
              align: "right",
              presentation: "link",
              hrefKey: "href",
            },
          ]}
          rows={programCourses.flatMap((programCourse, index) =>
            programCourse.course
              ? [
                  {
                    id: programCourse.course.id,
                    position: index + 1,
                    title: programCourse.course.title,
                    action: "View →",
                    href: `/admin/reports/courses/${programCourse.course.id}`,
                  },
                ]
              : [],
          )}
          empty="No courses in this program yet."
        />
      </Card>

      <Card padding="sm">
        <div style={{ padding: "6px 12px 12px" }}>
          <AdminSectionHeading
            title="Progress by learner"
            description="Across every required lesson in the program's courses."
          />
        </div>
        <AdminDataTable
          minWidth="52rem"
          empty="Nobody's started the program yet."
          columns={[
            {
              key: "name",
              label: "Name",
              presentation: "link",
              hrefKey: "href",
            },
            { key: "lessons", label: "Lessons", align: "right", tabular: true },
            {
              key: "pct",
              label: "%",
              align: "right",
              tabular: true,
              suffix: "%",
            },
            {
              key: "coursesDone",
              label: "Courses done",
              align: "right",
              tabular: true,
            },
            { key: "certificate", label: "Program cert", muted: true },
            { key: "latestLabel", label: "Last activity", muted: true },
          ]}
          rows={rows.map((row) => ({
            ...row,
            href: `/admin/reports/users/${row.id}`,
            lessons: `${row.doneCount} / ${row.total}`,
            coursesDone: `${row.coursesComplete} / ${row.totalCourses}`,
            certificate: row.programCert?.certificate_number ?? "-",
            latestLabel: row.latest
              ? new Date(row.latest).toLocaleString()
              : "-",
          }))}
        />
      </Card>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return <AdminMetricCard label={label} value={value} />;
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

type ProgramLessonRow = {
  id: string;
  is_required_for_completion: boolean;
  modules: { course_id: string } | Array<{ course_id: string }> | null;
};

type ReportProfile = {
  id: string;
  full_name: string;
  email: string;
  system_role: "owner" | "admin" | "learner";
};
