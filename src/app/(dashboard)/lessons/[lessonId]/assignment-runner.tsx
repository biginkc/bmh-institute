"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/file-upload";

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

  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit() {
    startTransition(async () => {
      const result = await submitAssignment({
        assignmentId: assignment.id,
        lessonId,
        submission_type: assignment.submission_type,
        submission_text:
          assignment.submission_type === "text" ? text : undefined,
        submission_url:
          assignment.submission_type === "url" ? url : undefined,
        submission_file_path:
          assignment.submission_type === "file_upload" ? filePath ?? "" : undefined,
      });
      if (!result.ok) {
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
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-border rounded-md border p-4">
        <h3 className="mb-2 text-sm font-semibold">Instructions</h3>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {assignment.instructions}
        </div>
      </div>

      {approved ? (
        <StatusCard
          variant="success"
          icon={<CheckCircle2 className="size-5 text-emerald-600" />}
          title="Approved"
          description="Your submission was accepted. This lesson is complete."
        />
      ) : needsRevision ? (
        <StatusCard
          variant="warning"
          icon={<XCircle className="text-destructive size-5" />}
          title="Needs revision"
          description={
            latest?.reviewer_notes ??
            "An admin asked for changes. Submit again below."
          }
        />
      ) : awaitingReview ? (
        <StatusCard
          variant="info"
          icon={<Clock className="size-5 text-blue-600" />}
          title="Submitted, awaiting review"
          description="An admin will approve or ask for changes."
        />
      ) : null}

      {approved ? null : (
        <div className="border-border rounded-md border p-4">
          <h3 className="mb-4 text-sm font-semibold">Your submission</h3>
          {assignment.submission_type === "text" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="sub-text">Response</Label>
              <textarea
                id="sub-text"
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Type your response..."
              />
            </div>
          ) : null}

          {assignment.submission_type === "url" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="sub-url">URL</Label>
              <Input
                id="sub-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          ) : null}

          {assignment.submission_type === "file_upload" ? (
            <div className="flex flex-col gap-2">
              <Label>File</Label>
              <FileUpload
                bucket="submissions"
                accept="*/*"
                maxMb={500}
                currentPath={filePath}
                onUploaded={(f) => {
                  setFilePath(f.file_path || null);
                  setFilename(f.filename || null);
                }}
                label="Upload file"
              />
              {filename ? (
                <p className="text-muted-foreground text-xs">
                  Selected: {filename}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-2">
            {assignment.requires_review ? (
              <Badge variant="outline">Requires admin review</Badge>
            ) : (
              <Badge variant="secondary">Auto-complete on submit</Badge>
            )}
            <Button onClick={onSubmit} disabled={pending}>
              {pending ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      )}

      {priorSubmissions.length > 0 ? (
        <div className="border-border rounded-md border p-4">
          <h3 className="mb-3 text-sm font-semibold">Submission history</h3>
          <ol className="divide-border divide-y">
            {priorSubmissions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div>
                  <div className="text-muted-foreground text-xs">
                    {new Date(s.submitted_at).toLocaleString()}
                  </div>
                  {s.reviewer_notes ? (
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {s.reviewer_notes}
                    </div>
                  ) : null}
                </div>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: PriorSubmission["status"] }) {
  if (status === "approved") return <Badge>Approved</Badge>;
  if (status === "needs_revision")
    return <Badge variant="destructive">Needs revision</Badge>;
  return <Badge variant="secondary">Submitted</Badge>;
}

function StatusCard({
  variant,
  icon,
  title,
  description,
}: {
  variant: "success" | "warning" | "info";
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const cls =
    variant === "success"
      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
      : variant === "warning"
        ? "border-destructive/30 bg-destructive/10"
        : "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950";
  return (
    <div className={`flex items-start gap-3 rounded-md border p-4 ${cls}`}>
      {icon}
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-sm">{description}</div>
      </div>
    </div>
  );
}
