"use client";

import { useActionState, useState } from "react";

import { Button, Input } from "@/components/bmh-ds";
import { FileUpload } from "@/components/file-upload";
import { manualArtworkNamespace } from "@/lib/artwork/paths";
import type { FormState } from "./actions";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

type Defaults = {
  title?: string | null;
  description?: string | null;
  course_order_mode?: "sequential" | "free" | null;
  is_published?: boolean | null;
  thumbnail_path?: string | null;
  content_import_id?: string | null;
  thumbnail_asset_key?: string | null;
  thumbnail_approved_path?: string | null;
  thumbnail_approved_sha256?: string | null;
};

export function ProgramForm({
  action,
  submitLabel,
  defaults,
  entityId,
}: {
  action: Action;
  submitLabel: string;
  defaults?: Defaults;
  entityId?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    null,
  );
  const fieldError = (name: string): string | undefined =>
    state && !state.ok ? state.fieldErrors?.[name] : undefined;
  const [thumbnailPath, setThumbnailPath] = useState(defaults?.thumbnail_path ?? "");
  const artworkPrefix = !defaults?.content_import_id && entityId
    ? manualArtworkNamespace("program", entityId)
    : null;

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

      <Field
        label="Description"
        htmlFor="description"
        error={fieldError("description")}
      >
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={defaults?.description ?? ""}
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 font-[family-name:var(--font-body)] text-base font-semibold text-[var(--ink-900)] outline-none transition focus-visible:border-[var(--action)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)]"
        />
      </Field>

      <Field
        label="Program cover path"
        htmlFor="thumbnail_path_display"
        error={fieldError("thumbnail_path")}
      >
        <input type="hidden" name="thumbnail_path" value={thumbnailPath} />
        <Input id="thumbnail_path_display" value={thumbnailPath} readOnly />
        {defaults?.content_import_id ? (
          <p className="text-xs font-semibold text-[var(--text-muted)]">
            Imported artwork is managed through the approved course manifest.
          </p>
        ) : artworkPrefix ? (
          <FileUpload
            accept="image/png,image/jpeg,image/webp,image/avif"
            maxMb={20}
            label="Upload program cover"
            currentPath={thumbnailPath || null}
            pathPrefix={artworkPrefix}
            onUploaded={(file) => setThumbnailPath(file.file_path)}
          />
        ) : (
          <p className="text-xs font-semibold text-[var(--text-muted)]">Save the program before uploading artwork.</p>
        )}
      </Field>

      <Field
        label="Course order"
        htmlFor="course_order_mode"
        error={fieldError("course_order_mode")}
      >
        <select
          id="course_order_mode"
          name="course_order_mode"
          defaultValue={defaults?.course_order_mode ?? "free"}
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 font-[family-name:var(--font-body)] text-base font-bold text-[var(--ink-900)] outline-none focus-visible:border-[var(--action)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)]"
        >
          <option value="free">Free: learner picks order</option>
          <option value="sequential">Sequential: unlock one at a time</option>
        </select>
      </Field>

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

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-800)]"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="font-[family-name:var(--font-body)] text-xs font-bold text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
