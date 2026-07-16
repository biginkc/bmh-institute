"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { defaultOptions as tusDefaultOptions, Upload as TusUpload } from "tus-js-client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  ValidatingTusUrlStorage,
  assertSafeTusUrl,
  createScopedTusFingerprint,
  sha256Blob,
  supabaseResumableEndpoint,
} from "@/lib/storage/tus-safety";
import { cn } from "@/lib/utils";

export type UploadedFile = {
  file_path: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
};

const RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024;
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

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
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error("You need to be signed in to upload.");
        return;
      }

      const safeName = file.name
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "");
      const path = `${session.user.id}/${file.size}-${file.lastModified}-${safeName}`;

      const contentType = file.type || "application/octet-stream";
      if (file.size > RESUMABLE_THRESHOLD_BYTES) {
        await uploadResumably({
          file,
          bucket,
          path,
          contentType,
          accessToken: session.access_token,
          onProgress: setProgress,
        });
      } else {
        const { error } = await supabase.storage.from(bucket).upload(path, file, {
          contentType,
          upsert: false,
        });
        if (error) throw error;
        setProgress(100);
      }

      onUploaded({
        file_path: path,
        filename: file.name,
        size_bytes: file.size,
        mime_type: contentType,
      });
      toast.success("Uploaded.");
    } catch (error) {
      toast.error(`Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`);
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

async function uploadResumably({
  file,
  bucket,
  path,
  contentType,
  accessToken,
  onProgress,
}: {
  file: File;
  bucket: string;
  path: string;
  contentType: string;
  accessToken: string;
  onProgress: (progress: number) => void;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return Promise.reject(new Error("NEXT_PUBLIC_SUPABASE_URL is not configured."));
  const endpoint = supabaseResumableEndpoint(supabaseUrl);
  const checksum = await sha256Blob(file);
  const fingerprint = createScopedTusFingerprint({ endpoint, bucket, path, checksum });
  const urlStorage = new ValidatingTusUrlStorage(tusDefaultOptions.urlStorage, {
    endpoint,
    fingerprint,
    size: file.size,
    bucket,
    path,
    checksum,
    contentType,
  });

  return new Promise<void>((resolve, reject) => {
    const upload = new TusUpload(file, {
      endpoint,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: true,
      fingerprint: async () => fingerprint,
      urlStorage,
      chunkSize: TUS_CHUNK_BYTES,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType,
        cacheControl: "3600",
        metadata: JSON.stringify({ sha256: checksum }),
      },
      onBeforeRequest: (request) => assertSafeTusUrl(request.getURL(), endpoint),
      onProgress: (uploaded, total) => onProgress(total > 0 ? Math.round((uploaded / total) * 100) : 0),
      onError: reject,
      onSuccess: () => resolve(),
    });

    void upload.findPreviousUploads().then((previous) => {
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }, reject);
  });
}
