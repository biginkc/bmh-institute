import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

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
      profiles ( email, full_name ),
      assignments ( title ),
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
    <main className="mx-auto w-full max-w-4xl flex-1 p-6 md:p-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Submissions</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Review assignment submissions. Approving marks the lesson complete
            automatically.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <FilterLink current={filterStatus} value="submitted">Pending</FilterLink>
          <FilterLink current={filterStatus} value="needs_revision">Needs revision</FilterLink>
          <FilterLink current={filterStatus} value="approved">Approved</FilterLink>
          <FilterLink current={filterStatus} value="all">All</FilterLink>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing to review</CardTitle>
            <CardDescription>
              Everything in this filter is cleared.
            </CardDescription>
          </CardHeader>
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
  assignments: { title: string } | { title: string }[] | null;
  lessons: { title: string } | { title: string }[] | null;
};

function SubmissionCard({ row }: { row: Row }) {
  const profile = firstRow(row.profiles);
  const assignment = firstRow(row.assignments);
  const lesson = firstRow(row.lessons);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {assignment?.title ?? "Assignment"}
            </CardTitle>
            <CardDescription>
              {lesson?.title ?? "Lesson"} · {profile?.full_name ?? "Unknown"}{" "}
              ({profile?.email ?? "?"})
            </CardDescription>
          </div>
          <StatusBadge status={row.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-muted-foreground text-xs">
          Submitted {new Date(row.submitted_at).toLocaleString()}
        </div>

        {row.submission_text ? (
          <div className="border-border bg-muted/30 whitespace-pre-wrap rounded-md border p-3 text-sm">
            {row.submission_text}
          </div>
        ) : null}

        {row.submission_url ? (
          <a
            href={row.submission_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline-offset-2 hover:underline"
          >
            {row.submission_url}
          </a>
        ) : null}

        {row.reviewer_notes ? (
          <div className="border-border bg-muted/20 rounded-md border p-3 text-sm">
            <span className="text-muted-foreground text-xs">Note: </span>
            {row.reviewer_notes}
          </div>
        ) : null}

        {row.status === "submitted" ? (
          <ReviewControls
            submissionId={row.id}
            filePath={row.submission_file_path}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: Row["status"] }) {
  if (status === "approved") return <Badge>Approved</Badge>;
  if (status === "needs_revision")
    return <Badge variant="destructive">Needs revision</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
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
      className={
        active
          ? "bg-primary text-primary-foreground rounded-md px-2 py-1"
          : "text-muted-foreground hover:text-foreground rounded-md px-2 py-1"
      }
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
