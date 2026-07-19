"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, Input } from "@/components/bmh-ds";
import { Label } from "@/components/ui/label";
import type { AssignmentRubricItem } from "@/lib/assignments/rubric";
import {
  MAX_ASSIGNMENT_INSTRUCTIONS_LENGTH,
  MAX_ASSIGNMENT_TITLE_LENGTH,
} from "@/lib/assignments/validation";
import {
  MAX_RUBRIC_CRITERION_LENGTH,
  MAX_RUBRIC_DESCRIPTION_LENGTH,
  MAX_RUBRIC_ITEMS,
} from "@/lib/assignments/rubric";

import { updateAssignment } from "./assignment-actions";

export type AssignmentSettings = {
  id: string;
  title: string;
  instructions: string;
  submission_type: "file_upload" | "text" | "url";
  requires_review: boolean;
  rubric: AssignmentRubricItem[];
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
  const [rubric, setRubric] = useState(assignment.rubric);
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
        rubric,
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
          maxLength={MAX_ASSIGNMENT_TITLE_LENGTH}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="a-instructions">Instructions</Label>
        <textarea
          id="a-instructions"
          rows={5}
          maxLength={MAX_ASSIGNMENT_INSTRUCTIONS_LENGTH}
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
      <section
        aria-labelledby="assignment-rubric-heading"
        className="flex flex-col gap-3 rounded-[var(--bmh-radius-md)] border border-[var(--border-hairline)] bg-[var(--surface-tint)] p-4"
      >
        <div>
          <h3
            id="assignment-rubric-heading"
            className="font-[family-name:var(--font-display)] text-base font-extrabold text-[var(--ink-900)]"
          >
            Reviewer rubric
          </h3>
          <p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">
            Reviewers see these criteria beside each learner submission.
          </p>
        </div>

        {rubric.length === 0 ? (
          <p className="text-sm font-semibold text-[var(--text-muted)]">
            No criteria yet. Add at least one before saving a reviewed assignment.
          </p>
        ) : null}

        {rubric.map((item, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-[var(--bmh-radius-md)] border border-[var(--border-hairline)] bg-[var(--paper)] p-3"
          >
            <Input
              id={`a-rubric-criterion-${index}`}
              label={`Criterion ${index + 1}`}
              value={item.criterion}
              maxLength={MAX_RUBRIC_CRITERION_LENGTH}
              onChange={(event) =>
                setRubric((current) =>
                  current.map((criterion, criterionIndex) =>
                    criterionIndex === index
                      ? { ...criterion, criterion: event.target.value }
                      : criterion,
                  ),
                )
              }
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`a-rubric-description-${index}`}>What reviewers check</Label>
              <textarea
                id={`a-rubric-description-${index}`}
                rows={3}
                maxLength={MAX_RUBRIC_DESCRIPTION_LENGTH}
                value={item.description}
                onChange={(event) =>
                  setRubric((current) =>
                    current.map((criterion, criterionIndex) =>
                      criterionIndex === index
                        ? { ...criterion, description: event.target.value }
                        : criterion,
                    ),
                  )
                }
                className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 text-sm font-semibold text-[var(--ink-900)] outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--focus-ring)]"
              />
            </div>
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setRubric((current) => current.filter((_, criterionIndex) => criterionIndex !== index))
                }
              >
                Remove criterion
              </Button>
            </div>
          </div>
        ))}

        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || rubric.length >= MAX_RUBRIC_ITEMS}
            onClick={() =>
              setRubric((current) => [...current, { criterion: "", description: "" }])
            }
          >
            Add criterion
          </Button>
        </div>
      </section>
      <div>
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving..." : "Save assignment"}
        </Button>
      </div>
    </div>
  );
}
