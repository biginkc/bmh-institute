"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, Input } from "@/components/bmh-ds";
import { FileUpload } from "@/components/file-upload";
import { Label } from "@/components/ui/label";
import { importArtworkNamespace, importStoragePrefix, manualArtworkNamespace } from "@/lib/artwork/paths";

import { updateLessonDetails } from "./actions";

export function LessonDetailsForm({
  lessonId,
  defaultTitle,
  defaultDescription,
  defaultRequired,
  defaultThumbnailPath = null,
  contentImportId = null,
}: {
  lessonId: string;
  defaultTitle: string;
  defaultDescription: string | null;
  defaultRequired: boolean;
  defaultThumbnailPath?: string | null;
  contentImportId?: string | null;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription ?? "");
  const [required, setRequired] = useState(defaultRequired);
  const [thumbnailPath, setThumbnailPath] = useState(defaultThumbnailPath ?? "");
  const [pending, startTransition] = useTransition();
  const importPrefix = contentImportId ? importStoragePrefix(contentImportId) : null;
  const artworkPrefix = importPrefix
    ? importArtworkNamespace(importPrefix)
    : manualArtworkNamespace("lesson", lessonId);

  function onSave() {
    startTransition(async () => {
      const result = await updateLessonDetails({
        lessonId,
        title,
        description: description.trim() === "" ? null : description.trim(),
        is_required_for_completion: required,
        thumbnail_path: thumbnailPath || null,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Saved.");
    });
  }

  return (
    <div className="flex flex-col gap-5 font-[family-name:var(--font-body)]">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 text-sm font-semibold text-[var(--ink-900)] outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--focus-ring)]"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="is_required"
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="size-4 accent-[var(--action)]"
        />
        <Label htmlFor="is_required">
          Required for course completion
        </Label>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lesson-thumbnail-path">Lesson thumbnail path</Label>
        <Input id="lesson-thumbnail-path" value={thumbnailPath} readOnly />
        <FileUpload
          accept="image/png,image/jpeg,image/webp,image/avif"
          maxMb={20}
          label="Upload lesson thumbnail"
          currentPath={thumbnailPath || null}
          pathPrefix={artworkPrefix}
          onUploaded={(file) => setThumbnailPath(file.file_path)}
        />
      </div>

      <div>
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
