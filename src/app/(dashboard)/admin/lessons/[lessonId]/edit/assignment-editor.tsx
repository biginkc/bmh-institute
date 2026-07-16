"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, Input } from "@/components/bmh-ds";
import { Label } from "@/components/ui/label";

import { updateAssignment } from "./assignment-actions";

export type AssignmentSettings = {
  id: string;
  title: string;
  instructions: string;
  submission_type: "file_upload" | "text" | "url";
  requires_review: boolean;
};

export function AssignmentEditor({
  lessonId,
  assignment,
}: {
  lessonId: string;
  assignment: AssignmentSettings;
}) {
  const [title, setTitle] = useState(assignment.title);
  const [instructions, setInstructions] = useState(assignment.instructions);
  const [submissionType, setSubmissionType] = useState(
    assignment.submission_type,
  );
  const [requiresReview, setRequiresReview] = useState(
    assignment.requires_review,
  );
  const [pending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      const result = await updateAssignment({
        assignmentId: assignment.id,
        lessonId,
        title,
        instructions,
        submission_type: submissionType,
        requires_review: requiresReview,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Assignment saved.");
    });
  }

  return (
    <div className="flex flex-col gap-4 font-[family-name:var(--font-body)]">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="a-title">Title</Label>
        <Input
          id="a-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="a-instructions">Instructions</Label>
        <textarea
          id="a-instructions"
          rows={5}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 text-sm font-semibold text-[var(--ink-900)] outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--focus-ring)]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="a-submission">Submission type</Label>
        <select
          id="a-submission"
          value={submissionType}
          onChange={(e) =>
            setSubmissionType(
              e.target.value as "file_upload" | "text" | "url",
            )
          }
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 text-sm font-bold text-[var(--ink-900)] outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--focus-ring)]"
        >
          <option value="text">Text response</option>
          <option value="url">URL</option>
          <option value="file_upload">File upload</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="a-review"
          type="checkbox"
          checked={requiresReview}
          onChange={(e) => setRequiresReview(e.target.checked)}
          className="size-4 accent-[var(--action)]"
        />
        <Label htmlFor="a-review">Requires admin review</Label>
      </div>
      <div>
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving..." : "Save assignment"}
        </Button>
      </div>
    </div>
  );
}
