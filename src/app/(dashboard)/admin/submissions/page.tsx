import Link from "next/link";

import { Badge, Card, Coach } from "@/components/bmh-ds";
import { parseAssignmentRubric } from "@/lib/assignments/rubric";
import { createClient } from "@/lib/supabase/server";

import { AdminPageHeader } from "../_components/admin-shell";
import { ReviewControls } from "./review-controls";

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const filterStatus = sp.status ?? "submitted";

  const supabase = await createClient();
  let query = supabase
    .from("assignment_submissions")
    .select(
      `
      id,
      status,
      submitted_at,
      reviewer_notes,
      submission_text,
      submission_url,
      submission_file_path,
      user_id,
      lesson_id,
      assignment_id,
      profiles!assignment_submissions_user_id_fkey ( email, full_name ),
      assignments ( title, rubric ),
      lessons ( title )
    `,
    )
    .order("submitted_at", { ascending: false })
    .limit(200);

  if (filterStatus !== "all") {
    query = query.eq("status", filterStatus);
  }

  const { data: submissions } = await query;
  const rows = (submissions ?? []) as Row[];

  return (
    <main className="w-full flex-1 p-6 md:p-10">
      <AdminPageHeader
        title="Submissions"
        description="Review assignment submissions. Approving marks the lesson complete automatically."
        actions={
          <div className="flex flex-wrap gap-2 text-xs">
            <FilterLink current={filterStatus} value="submitted">Pending</FilterLink>
            <FilterLink current={filterStatus} value="needs_revision">Needs revision</FilterLink>
            <FilterLink current={filterStatus} value="approved">Approved</FilterLink>
            <FilterLink current={filterStatus} value="all">All</FilterLink>
          </div>
        }
      />

      {rows.length === 0 ? (
        <Card padding="md">
          <Coach
            emotion="content"
            tone="tint"
            size="sm"
            height={80}
            message="Nothing to review in this filter. You're all caught up."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((s) => (
            <SubmissionCard key={s.id} row={s} />
          ))}
        </div>
      )}
    </main>
  );
}

type Row = {
  id: string;
  status: "submitted" | "approved" | "needs_revision";
  submitted_at: string;
  reviewer_notes: string | null;
  submission_text: string | null;
  submission_url: string | null;
  submission_file_path: string | null;
  profiles: { email: string; full_name: string } | { email: string; full_name: string }[] | null;
  assignments: { title: string; rubric: unknown } | { title: string; rubric: unknown }[] | null;
  lessons: { title: string } | { title: string }[] | null;
};

function SubmissionCard({ row }: { row: Row }) {
  const profile = firstRow(row.profiles);
  const assignment = firstRow(row.assignments);
  const lesson = firstRow(row.lessons);
  const rubric = parseAssignmentRubric(assignment?.rubric);

  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-display)] text-lg font-bold text-[var(--ink-900)]">
            {assignment?.title ?? "Assignment"}
          </h2>
          <p className="text-sm font-semibold text-[var(--text-muted)]">
            {lesson?.title ?? "Lesson"} · {profile?.full_name ?? "Unknown"}{" "}
            ({profile?.email ?? "?"})
          </p>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="mt-4 space-y-4">
        <div className="text-xs font-semibold text-[var(--text-muted)]">
          Submitted {new Date(row.submitted_at).toLocaleString()}
        </div>

        {rubric.length > 0 ? (
          <section
            aria-labelledby={`submission-${row.id}-rubric`}
            className="rounded-[var(--bmh-radius-md)] border border-[var(--border-hairline)] bg-[var(--surface-tint)] p-4"
          >
            <h3
              id={`submission-${row.id}-rubric`}
              className="font-[family-name:var(--font-display)] text-base font-extrabold text-[var(--ink-900)]"
            >
              Review rubric
            </h3>
            <ol className="mt-3 space-y-3">
              {rubric.map((item, index) => (
                <li key={`${item.criterion}-${index}`} className="text-sm text-[var(--text-body)]">
                  <p className="font-extrabold text-[var(--ink-900)]">{item.criterion}</p>
                  <p className="mt-0.5 font-semibold leading-relaxed">{item.description}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {row.submission_text ? (
          <div className="whitespace-pre-wrap rounded-[var(--bmh-radius-md)] border border-[var(--border-hairline)] bg-[var(--ink-050)] p-3 text-sm font-semibold text-[var(--text-body)]">
            {row.submission_text}
          </div>
        ) : null}

        {row.submission_url ? (
          <a
            href={row.submission_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-[var(--action)] underline-offset-2 hover:underline"
          >
            {row.submission_url}
          </a>
        ) : null}

        {row.reviewer_notes ? (
          <div className="rounded-[var(--bmh-radius-md)] border border-[var(--border-hairline)] bg-[var(--surface-tint)] p-3 text-sm">
            <span className="text-xs font-bold text-[var(--text-muted)]">Note: </span>
            {row.reviewer_notes}
          </div>
        ) : null}

        {row.status === "submitted" ? (
          <ReviewControls
            submissionId={row.id}
            filePath={row.submission_file_path}
          />
        ) : null}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: Row["status"] }) {
  if (status === "approved") return <Badge tone="green" size="sm">Approved</Badge>;
  if (status === "needs_revision")
    return <Badge tone="red" size="sm">Needs revision</Badge>;
  return <Badge tone="yellow" size="sm" dot>Pending</Badge>;
}

function FilterLink({
  current,
  value,
  children,
}: {
  current: string;
  value: string;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <Link
      href={value === "submitted" ? "/admin/submissions" : `/admin/submissions?status=${value}`}
      className="rounded-full px-3 py-2 font-extrabold no-underline"
      style={{
        background: active ? "var(--action)" : "var(--ink-100)",
        color: active ? "var(--text-on-brand)" : "var(--ink-700)",
      }}
    >
      {children}
    </Link>
  );
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
