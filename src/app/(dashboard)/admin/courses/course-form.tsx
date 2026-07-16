"use client";

import { useActionState, useState } from "react";

import { Button, Input } from "@/components/bmh-ds";
import { FileUpload } from "@/components/file-upload";

import type { CourseFormState } from "./actions";

type Action = (
  state: CourseFormState,
  formData: FormData,
) => Promise<CourseFormState>;

type Defaults = {
  title?: string | null;
  description?: string | null;
  is_published?: boolean | null;
  thumbnail_path?: string | null;
};

export function CourseForm({
  action,
  submitLabel,
  defaults,
}: {
  action: Action;
  submitLabel: string;
  defaults?: Defaults;
}) {
  const [state, formAction, pending] = useActionState<
    CourseFormState,
    FormData
  >(action, null);
  const fieldError = (name: string): string | undefined =>
    state && !state.ok ? state.fieldErrors?.[name] : undefined;
  const [thumbnailPath, setThumbnailPath] = useState(defaults?.thumbnail_path ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Input
        id="title"
        name="title"
        label="Title"
        required
        defaultValue={defaults?.title ?? ""}
        maxLength={200}
        error={fieldError("title")}
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="description"
          className="font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-800)]"
        >
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={defaults?.description ?? ""}
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 font-[family-name:var(--font-body)] text-base font-semibold text-[var(--ink-900)] outline-none transition focus-visible:border-[var(--action)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)]"
        />
      </div>

      <div className="flex items-center gap-2.5">
        <input type="hidden" name="thumbnail_path" value={thumbnailPath} />
        <div className="flex w-full flex-col gap-1.5">
          <label
            htmlFor="thumbnail_path_display"
            className="font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-800)]"
          >
            Course cover path
          </label>
          <Input id="thumbnail_path_display" value={thumbnailPath} readOnly />
          <FileUpload
            accept="image/png,image/jpeg,image/webp"
            maxMb={20}
            label="Upload course cover"
            currentPath={thumbnailPath || null}
            onUploaded={(file) => setThumbnailPath(file.file_path)}
          />
          {fieldError("thumbnail_path") ? (
            <p className="text-xs font-bold text-[var(--danger)]">{fieldError("thumbnail_path")}</p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <input
          id="is_published"
          name="is_published"
          type="checkbox"
          defaultChecked={defaults?.is_published ?? false}
          className="size-[18px] accent-[var(--action)]"
        />
        <label
          htmlFor="is_published"
          className="font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-800)]"
        >
          Published (visible to learners)
        </label>
      </div>

      {state && !state.ok ? (
        <div className="rounded-[var(--bmh-radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--danger)]">
          {state.error}
        </div>
      ) : null}
      {state && state.ok ? (
        <div className="rounded-[var(--bmh-radius-md)] border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--green-500)]">
          Saved.
        </div>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
