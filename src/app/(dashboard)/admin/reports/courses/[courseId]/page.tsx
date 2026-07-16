import { notFound } from "next/navigation";

import { Badge, Card } from "@/components/bmh-ds";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

import { AdminDataTable } from "../../../_components/admin-data-table";
import {
  AdminMetricCard,
  AdminPageHeader,
  AdminSectionHeading,
} from "../../../_components/admin-shell";

export default async function CourseReportPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  // HARDEN-01: page-level guard so a direct fetch can't bypass the layout.
  await requireAdmin();
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
    const uid = c.user_id;
    const lid = c.lesson_id;
    if (!requiredLessonIds.has(lid)) continue;
    const row = byUser.get(uid) ?? { userId: uid, doneCount: 0, latest: null };
    row.doneCount++;
    const ts = c.completed_at;
    if (!row.latest || ts > row.latest) row.latest = ts;
    byUser.set(uid, row);
  }

  const certByUser = new Map<
    string,
    { issued_at: string; certificate_number: string }
  >();
  for (const cert of certsRes.data ?? []) {
    certByUser.set(cert.user_id, {
      issued_at: cert.issued_at,
      certificate_number: cert.certificate_number,
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
      <AdminPageHeader
        eyebrow="Admin · Report"
        title={course.title}
        description={course.description}
        backHref="/admin/reports"
        backLabel="Back to reports"
        actions={
          <Badge tone={course.is_published ? "green" : "neutral"} size="sm">
            {course.is_published ? "Published" : "Draft"}
          </Badge>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatCard label="Required lessons" value={totalRequired} />
        <StatCard label="Learners with progress" value={rows.length} />
        <StatCard
          label="Certificates issued"
          value={(certsRes.data ?? []).length}
        />
      </div>

      <Card padding="sm">
        <div style={{ padding: "6px 12px 12px" }}>
          <AdminSectionHeading
            title="Progress by learner"
            description="Only learners with at least one completion or an issued certificate appear here. Click a name for their full cross-course view."
          />
        </div>
        <AdminDataTable
          minWidth="48rem"
          empty="No one has started this course yet."
          columns={[
            { key: "name", label: "Name", presentation: "link", hrefKey: "href" },
            { key: "systemRole", label: "Role", presentation: "badge", toneKey: "roleTone" },
            { key: "doneLabel", label: "Done", align: "right", tabular: true },
            { key: "pct", label: "%", align: "right", tabular: true, suffix: "%" },
            { key: "certificate", label: "Certificate", muted: true },
            { key: "latestLabel", label: "Last activity", muted: true },
          ]}
          rows={rows.map((row) => ({
            ...row,
            href: `/admin/reports/users/${row.id}`,
            roleTone: row.systemRole === "owner" ? "solid" : row.systemRole === "admin" ? "blue" : "neutral",
            doneLabel: `${row.doneCount} / ${row.total}`,
            certificate: row.cert?.certificate_number ?? "-",
            latestLabel: row.latest ? new Date(row.latest).toLocaleString() : "-",
          }))}
        />
      </Card>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return <AdminMetricCard label={label} value={value} />;
}
