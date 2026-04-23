"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type UploadedFile = {
  file_path: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
};

/**
 * Uploads directly from the browser to the `content` Supabase Storage bucket
 * using the signed-in user's JWT. Supabase RLS gates the write to admins;
 * this component doesn't enforce that — it just surfaces the RLS error if the
 * caller isn't authorized.
 *
 * Paths use `{user_id}/{timestamp}-{safe-filename}` so every file is traceable
 * to the admin who uploaded it and clashes are avoided without random IDs.
 */
export function FileUpload({
  accept,
  maxMb = 2048,
  onUploaded,
  currentPath,
  label = "Upload file",
  bucket = "content",
}: {
  accept: string;
  maxMb?: number;
  onUploaded: (file: UploadedFile) => void;
  currentPath?: string | null;
  label?: string;
  bucket?: "content" | "submissions" | "avatars";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const maxBytes = maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error(
        `File is ${(file.size / 1024 / 1024).toFixed(1)} MB; limit is ${maxMb} MB.`,
      );
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You need to be signed in to upload.");
        return;
      }

      const safeName = file.name
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "");
      const path = `${user.id}/${Date.now()}-${safeName}`;

      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (error) {
        toast.error(`Upload failed: ${error.message}`);
        return;
      }

      onUploaded({
        file_path: path,
        filename: file.name,
        size_bytes: file.size,
        mime_type: file.type || "application/octet-stream",
      });
      toast.success("Uploaded.");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onFileChange}
        className="hidden"
      />
      {currentPath ? (
        <div className="border-border bg-muted/30 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
          <span className="truncate font-mono" title={currentPath}>
            {currentPath.split("/").pop()}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onUploaded({ file_path: "", filename: "", size_bytes: 0, mime_type: "" })}
            aria-label="Clear"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={cn(uploading && "cursor-wait")}
      >
        <Upload className="size-3.5" />
        {uploading
          ? progress !== null
            ? `Uploading… ${progress}%`
            : "Uploading…"
          : currentPath
            ? "Replace file"
            : label}
      </Button>
    </div>
  );
}
