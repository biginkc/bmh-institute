"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, IconButton } from "@/components/bmh-ds";

import {
  attachCourseToProgram,
  detachCourseFromProgram,
} from "../../actions";

type AttachedCourse = {
  courseId: string;
  title: string;
  isPublished: boolean;
  sortOrder: number;
};

type AvailableCourse = {
  id: string;
  title: string;
  isPublished: boolean;
};

export function CourseAttachments({
  programId,
  attached,
  available,
}: {
  programId: string;
  attached: AttachedCourse[];
  available: AvailableCourse[];
}) {
  const [selected, setSelected] = useState<string>(available[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  function onAttach() {
    if (!selected) {
      toast.error("Pick a course to attach.");
      return;
    }
    startTransition(async () => {
      const result = await attachCourseToProgram({
        programId,
        courseId: selected,
      });
      if (result && !result.ok) toast.error(result.error);
      else toast.success("Course attached.");
    });
  }

  function onDetach(courseId: string) {
    startTransition(async () => {
      const result = await detachCourseFromProgram({ programId, courseId });
      if (result && !result.ok) toast.error(result.error);
      else toast.success("Course removed from program.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {attached.length === 0 ? (
        <p className="font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
          No courses attached yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {attached.map((c, idx) => (
            <li
              key={c.courseId}
              className="flex items-center justify-between gap-3 rounded-[var(--bmh-radius-md)] border border-[var(--border-card)] bg-[var(--paper)] px-3 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--action)] font-[family-name:var(--font-display)] text-xs font-extrabold text-[var(--paper)]">
                  {idx + 1}
                </span>
                <div>
                  <div className="font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-900)]">
                    {c.title}
                  </div>
                  <Badge
                    tone={c.isPublished ? "green" : "neutral"}
                    size="sm"
                  >
                    {c.isPublished ? "Published" : "Draft"}
                  </Badge>
                </div>
              </div>
              <IconButton
                variant="plain"
                size="sm"
                label={`Remove ${c.title}`}
                onClick={() => onDetach(c.courseId)}
                disabled={pending}
              >
                <X className="size-4" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ol>
      )}

      {available.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="attach-course"
              className="mb-1.5 block font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-800)]"
            >
              Attach a course
            </label>
            <select
              id="attach-course"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="min-h-[46px] w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-3 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-900)] outline-none focus-visible:border-[var(--action)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)]"
            >
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} {c.isPublished ? "" : "(draft)"}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={onAttach}
            disabled={pending}
            iconLeft={<Plus className="size-4" aria-hidden />}
          >
            {pending ? "Saving..." : "Attach"}
          </Button>
        </div>
      ) : (
        <p className="font-[family-name:var(--font-body)] text-xs font-semibold text-[var(--text-muted)]">
          All courses are already attached (or none exist yet).
        </p>
      )}
    </div>
  );
}
