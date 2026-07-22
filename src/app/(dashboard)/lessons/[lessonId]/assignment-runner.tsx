"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, RotateCcw, Send, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { FileUpload } from "@/components/file-upload";
import { Badge } from "@/components/bmh-ds/badge";
import { Button } from "@/components/bmh-ds/button";
import { Card } from "@/components/bmh-ds/card";
import { Coach } from "@/components/bmh-ds/coach";
import { Input } from "@/components/bmh-ds/input";

import { submitAssignment } from "./assignment-actions";

export type AssignmentDescriptor = {
  id: string;
  title: string;
  instructions: string;
  submission_type: "text" | "url" | "file_upload";
  requires_review: boolean;
};

export type PriorSubmission = {
  id: string;
  status: "submitted" | "approved" | "needs_revision";
  submitted_at: string;
  reviewer_notes: string | null;
  submission_text: string | null;
  submission_url: string | null;
  submission_file_path: string | null;
};

export function AssignmentRunner({
  lessonId,
  assignment,
  priorSubmissions,
}: {
  lessonId: string;
  assignment: AssignmentDescriptor;
  priorSubmissions: PriorSubmission[];
}) {
  const latest = priorSubmissions[0];
  const approved = latest?.status === "approved";
  const needsRevision = latest?.status === "needs_revision";
  const awaitingReview = latest?.status === "submitted";
  const revision = needsRevision ? latest : null;

  const [text, setText] = useState(revision?.submission_text ?? "");
  const [url, setUrl] = useState(revision?.submission_url ?? "");
  const [filePath, setFilePath] = useState<string | null>(
    revision?.submission_file_path ?? null,
  );
  const [filename, setFilename] = useState<string | null>(
    filenameFromPath(revision?.submission_file_path),
  );
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit() {
    setSubmissionError(null);
    startTransition(async () => {
      try {
        const result = await submitAssignment({
          assignmentId: assignment.id,
          lessonId,
          submission_type: assignment.submission_type,
          submission_text: assignment.submission_type === "text" ? text : undefined,
          submission_url: assignment.submission_type === "url" ? url : undefined,
          submission_file_path:
            assignment.submission_type === "file_upload" ? filePath ?? "" : undefined,
        });
        if (!result.ok) {
          setSubmissionError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success(
          assignment.requires_review
            ? "Submitted. An admin will review."
            : "Submitted.",
        );
        setText("");
        setUrl("");
        setFilePath(null);
        setFilename(null);
        router.refresh();
      } catch {
        const message = "Submission could not be confirmed. Check your connection and try again.";
        setSubmissionError(message);
        router.refresh();
        toast.error(message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card outline padding="md" tint>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-extrabold text-[var(--ink-900)]">
            Instructions
          </h2>
          <Badge tone="orange">Assignment</Badge>
        </div>
        <p className="whitespace-pre-wrap font-[family-name:var(--font-body)] text-sm font-semibold leading-relaxed text-[var(--text-body)]">
          {assignment.instructions}
        </p>
      </Card>

      {approved ? (
        <AssignmentStatus
          title="Approved"
          emotion="laugh"
          tone="yellow"
          badgeTone="green"
          message="Approved! This lesson is now complete. Great work."
        />
      ) : needsRevision ? (
        <>
          <AssignmentStatus
            title="Needs revision"
            emotion="worried"
            tone="white"
            badgeTone="red"
            message="You're close. Review the note, make the change, and send your work again."
          />
          <Card padding="md" outline>
            <div className="flex items-start gap-3">
              <MessageSquare
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-[var(--danger)]"
              />
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-base font-extrabold text-[var(--ink-900)]">
                  Reviewer note
                </h3>
                <p className="mt-1 whitespace-pre-wrap font-[family-name:var(--font-body)] text-sm font-semibold leading-relaxed text-[var(--text-body)]">
                  {latest?.reviewer_notes ??
                    "An admin asked for changes. Update your work and submit again below."}
                </p>
              </div>
            </div>
          </Card>
        </>
      ) : awaitingReview ? (
        <AssignmentStatus
          title="Submitted, awaiting review"
          emotion="content"
          tone="tint"
          badgeTone="yellow"
          message="Submitted! Your lead will review your work and leave feedback here."
        />
      ) : null}

      {approved || awaitingReview ? null : (
        <Card padding="md">
          <h2 className="mb-5 font-[family-name:var(--font-display)] text-xl font-extrabold text-[var(--ink-900)]">
            Your submission
          </h2>

          {assignment.submission_type === "text" ? (
            <div className="flex flex-col gap-2">
              <label
                htmlFor="sub-text"
                className="font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-800)]"
              >
                Response
              </label>
              <textarea
                id="sub-text"
                rows={8}
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="w-full resize-y rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-200)] bg-[var(--paper)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--ink-900)] outline-none transition-shadow placeholder:text-[var(--text-muted)] focus:border-[var(--action)] focus:shadow-[0_0_0_4px_var(--focus-ring)]"
                placeholder="Type your response..."
              />
            </div>
          ) : null}

          {assignment.submission_type === "url" ? (
            <Input
              id="sub-url"
              label="URL"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://..."
            />
          ) : null}

          {assignment.submission_type === "file_upload" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-800)]">
                <UploadCloud aria-hidden="true" className="size-5 text-[var(--action)]" />
                File
              </div>
              <div className="rounded-[var(--bmh-radius-lg)] border-2 border-dashed border-[var(--ink-300)] bg-[var(--ink-050)] p-5">
                <FileUpload
                  bucket="submissions"
                  accept="*/*"
                  maxMb={500}
                  currentPath={filePath}
                  onUploaded={(file) => {
                    setFilePath(file.file_path || null);
                    setFilename(file.filename || null);
                  }}
                  label="Upload file"
                />
                {filename ? (
                  <p className="mt-2 font-[family-name:var(--font-body)] text-xs font-bold text-[var(--text-muted)]">
                    Selected: {filename}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {submissionError ? (
            <p
              role="alert"
              className="mt-3 rounded-[var(--bmh-radius-md)] border-2 border-[var(--danger)] bg-red-50 px-4 py-3 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--danger)]"
            >
              {submissionError}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <Badge tone={assignment.requires_review ? "neutral" : "green"}>
              {assignment.requires_review
                ? "Requires admin review"
                : "Completes when submitted"}
            </Badge>
            <Button
              size="lg"
              onClick={onSubmit}
              disabled={pending}
              iconLeft={
                needsRevision ? (
                  <RotateCcw aria-hidden="true" className="size-4" />
                ) : (
                  <Send aria-hidden="true" className="size-4" />
                )
              }
            >
              {pending
                ? "Submitting..."
                : needsRevision
                  ? "Resubmit for review"
                  : assignment.requires_review
                    ? "Submit for review"
                    : "Submit assignment"}
            </Button>
          </div>
        </Card>
      )}

      {priorSubmissions.length > 0 ? (
        <Card padding="md">
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-lg font-extrabold text-[var(--ink-900)]">
            Submission history
          </h2>
          <ol className="divide-y divide-[var(--border-card)]">
            {priorSubmissions.map((submission) => (
              <li
                key={submission.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <div className="font-[family-name:var(--font-body)] text-xs font-bold text-[var(--text-muted)]">
                    {new Date(submission.submitted_at).toLocaleString()}
                  </div>
                  {submission.reviewer_notes ? (
                    <div className="mt-1 font-[family-name:var(--font-body)] text-xs font-semibold text-[var(--text-body)]">
                      {submission.reviewer_notes}
                    </div>
                  ) : null}
                </div>
                <StatusBadge status={submission.status} />
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}

function filenameFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.split("/").at(-1) || null;
}

function AssignmentStatus({
  title,
  emotion,
  tone,
  badgeTone,
  message,
}: {
  title: string;
  emotion: "laugh" | "worried" | "content";
  tone: "white" | "yellow" | "tint";
  badgeTone: "green" | "red" | "yellow";
  message: string;
}) {
  return (
    <Card padding="md" outline>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-extrabold text-[var(--ink-900)]">
          {title}
        </h2>
        <Badge tone={badgeTone}>{title}</Badge>
      </div>
      <Coach emotion={emotion} tone={tone} size="sm" message={message} />
    </Card>
  );
}

function StatusBadge({ status }: { status: PriorSubmission["status"] }) {
  if (status === "approved") return <Badge tone="green">Approved</Badge>;
  if (status === "needs_revision") {
    return <Badge tone="red">Needs revision</Badge>;
  }
  return (
    <Badge tone="yellow" dot>
      Submitted
    </Badge>
  );
}
