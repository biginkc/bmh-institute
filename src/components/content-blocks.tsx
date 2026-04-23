import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { VideoBlockPlayer } from "./video-block-player";

export type ContentBlock = {
  id: string;
  block_type:
    | "video"
    | "text"
    | "pdf"
    | "image"
    | "audio"
    | "download"
    | "external_link"
    | "embed"
    | "divider"
    | "callout";
  content: Record<string, unknown>;
  sort_order: number;
  is_required_for_completion: boolean;
};

export function ContentBlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.block_type) {
    case "text":
      return <TextBlock html={stringOr(block.content.html, "")} />;
    case "callout":
      return (
        <CalloutBlock
          variant={stringOr(block.content.variant, "info")}
          markdown={stringOr(block.content.markdown, "")}
        />
      );
    case "external_link":
      return (
        <ExternalLinkBlock
          url={stringOr(block.content.url, "#")}
          label={stringOr(block.content.label, "Open link")}
          description={stringOr(block.content.description, null)}
          openInNewTab={boolOr(block.content.open_in_new_tab, true)}
        />
      );
    case "divider":
      return <hr className="border-border my-4" />;
    case "image":
      return (
        <ImageBlock
          signedUrl={stringOr(block.content.signed_url, null)}
          filePath={stringOr(block.content.file_path, "")}
          alt={stringOr(block.content.alt, "")}
          caption={stringOr(block.content.caption, null)}
        />
      );
    case "pdf":
      return (
        <PdfBlock
          signedUrl={stringOr(block.content.signed_url, null)}
          filePath={stringOr(block.content.file_path, null)}
          display={stringOr(block.content.display, "inline")}
          filename={stringOr(block.content.filename, null)}
        />
      );
    case "audio":
      return (
        <AudioBlock
          source={stringOr(block.content.source, "upload")}
          signedUrl={stringOr(block.content.signed_url, null)}
          url={stringOr(block.content.url, null)}
          filePath={stringOr(block.content.file_path, null)}
        />
      );
    case "download":
      return (
        <DownloadBlock
          signedUrl={stringOr(block.content.signed_url, null)}
          filePath={stringOr(block.content.file_path, null)}
          filename={stringOr(block.content.filename, "file")}
          sizeBytes={
            typeof block.content.size_bytes === "number"
              ? block.content.size_bytes
              : null
          }
          description={stringOr(block.content.description, null)}
        />
      );
    case "video":
      return (
        <VideoBlock
          blockId={block.id}
          source={stringOr(block.content.source, "upload")}
          signedUrl={stringOr(block.content.signed_url, null)}
          url={stringOr(block.content.url, null)}
          filePath={stringOr(block.content.file_path, null)}
        />
      );
    case "embed":
      return (
        <EmbedBlock
          src={stringOr(block.content.iframe_src, "")}
          aspect={stringOr(block.content.aspect_ratio, "16:9")}
        />
      );
    default:
      return <UnsupportedBlock type={block.block_type} />;
  }
}

function stringOr<T extends string | null>(
  value: unknown,
  fallback: T,
): string | T {
  return typeof value === "string" ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function TextBlock({ html }: { html: string }) {
  return (
    <div
      className="prose prose-neutral dark:prose-invert max-w-none text-sm [&_blockquote]:text-muted-foreground [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mb-3 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_p]:mb-3 [&_p]:leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const CALLOUT_CLASSES: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100",
  warning:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  note: "border-border bg-muted/50 text-foreground",
};

function CalloutBlock({
  variant,
  markdown,
}: {
  variant: string;
  markdown: string;
}) {
  const cls = CALLOUT_CLASSES[variant] ?? CALLOUT_CLASSES.note;
  return (
    <div className={cn("rounded-md border px-4 py-3 text-sm", cls)}>
      {markdown}
    </div>
  );
}

function ExternalLinkBlock({
  url,
  label,
  description,
  openInNewTab,
}: {
  url: string;
  label: string;
  description: string | null;
  openInNewTab: boolean;
}) {
  const isExternal = url.startsWith("http") || openInNewTab;
  const className =
    "border-border hover:bg-muted/40 flex items-start gap-3 rounded-md border px-4 py-3 text-sm transition-colors";
  const content = (
    <>
      <ExternalLink className="mt-0.5 size-4 shrink-0" />
      <div>
        <div className="font-medium">{label}</div>
        {description ? (
          <div className="text-muted-foreground mt-0.5 text-xs">
            {description}
          </div>
        ) : null}
      </div>
    </>
  );

  if (isExternal) {
    return (
      <a
        href={url}
        target={openInNewTab ? "_blank" : undefined}
        rel={openInNewTab ? "noopener noreferrer" : undefined}
        className={className}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={url} className={className}>
      {content}
    </Link>
  );
}

function ImageBlock({
  signedUrl,
  filePath,
  alt,
  caption,
}: {
  signedUrl: string | null;
  filePath: string;
  alt: string;
  caption: string | null;
}) {
  const src = signedUrl ?? (filePath || null);
  if (!src) {
    return (
      <div className="border-border bg-muted/40 text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
        Image not set.
      </div>
    );
  }
  return (
    <figure className="my-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="rounded-md border" />
      {caption ? (
        <figcaption className="text-muted-foreground mt-2 text-xs">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function PdfBlock({
  signedUrl,
  filePath,
  display,
  filename,
}: {
  signedUrl: string | null;
  filePath: string | null;
  display: string;
  filename: string | null;
}) {
  const src = signedUrl ?? filePath;
  if (!src) {
    return (
      <div className="border-border bg-muted/40 text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
        PDF not set.
      </div>
    );
  }

  if (display === "download") {
    return (
      <a
        href={src}
        download={filename ?? undefined}
        className="border-border hover:bg-muted/40 flex items-center gap-3 rounded-md border px-4 py-3 text-sm"
      >
        <ExternalLink className="size-4" />
        <div>
          <div className="font-medium">{filename ?? "Download PDF"}</div>
          <div className="text-muted-foreground text-xs">PDF document</div>
        </div>
      </a>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <iframe
        src={src}
        title={filename ?? "PDF"}
        className="h-[640px] w-full"
      />
    </div>
  );
}

function AudioBlock({
  source,
  signedUrl,
  url,
  filePath,
}: {
  source: string;
  signedUrl: string | null;
  url: string | null;
  filePath: string | null;
}) {
  const src =
    source === "upload" ? (signedUrl ?? filePath) : (url ?? signedUrl);
  if (!src) {
    return (
      <div className="border-border bg-muted/40 text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
        Audio not set.
      </div>
    );
  }
  return (
    <div className="border-border rounded-md border p-3">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio src={src} controls preload="metadata" className="w-full" />
    </div>
  );
}

function DownloadBlock({
  signedUrl,
  filePath,
  filename,
  sizeBytes,
  description,
}: {
  signedUrl: string | null;
  filePath: string | null;
  filename: string;
  sizeBytes: number | null;
  description: string | null;
}) {
  const href = signedUrl ?? filePath;
  if (!href) {
    return (
      <div className="border-border bg-muted/40 text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
        File not set.
      </div>
    );
  }
  return (
    <a
      href={href}
      download={filename}
      className="border-border hover:bg-muted/40 flex items-center gap-3 rounded-md border px-4 py-3 text-sm"
    >
      <ExternalLink className="size-4" />
      <div className="flex-1">
        <div className="font-medium">{filename}</div>
        <div className="text-muted-foreground text-xs">
          {sizeBytes !== null ? formatBytes(sizeBytes) : null}
          {description ? (sizeBytes !== null ? " · " : "") + description : ""}
        </div>
      </div>
    </a>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function VideoBlock({
  blockId,
  source,
  signedUrl,
  url,
  filePath,
}: {
  blockId: string;
  source: string;
  signedUrl: string | null;
  url: string | null;
  filePath: string | null;
}) {
  // Uploaded video: prefer the signed URL the server attached.
  if (source === "upload") {
    const src = signedUrl ?? filePath;
    if (!src) {
      return (
        <div className="border-border bg-muted/40 text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
          Video not available.
        </div>
      );
    }
    return <VideoBlockPlayer blockId={blockId} src={src} />;
  }

  if (!url) {
    return (
      <div className="border-border bg-muted/40 text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
        Video URL not set.
      </div>
    );
  }

  const embedSrc = toEmbedSrc(source, url);
  return (
    <div className="aspect-video overflow-hidden rounded-md border">
      <iframe
        src={embedSrc}
        title="Video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}

function toEmbedSrc(source: string, url: string): string {
  if (source === "youtube") {
    const id = extractYouTubeId(url);
    return id
      ? `https://www.youtube-nocookie.com/embed/${id}`
      : url;
  }
  if (source === "vimeo") {
    const id = extractVimeoId(url);
    return id ? `https://player.vimeo.com/video/${id}?dnt=1` : url;
  }
  if (source === "loom") {
    const id = extractLoomId(url);
    return id ? `https://www.loom.com/embed/${id}` : url;
  }
  return url;
}

function extractYouTubeId(url: string): string | null {
  const m =
    url.match(/[?&]v=([^&]+)/) ||
    url.match(/youtu\.be\/([^?&/]+)/) ||
    url.match(/youtube\.com\/embed\/([^?&/]+)/);
  return m ? m[1] : null;
}

function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

function extractLoomId(url: string): string | null {
  const m = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

const EMBED_ASPECT_CLASS: Record<string, string> = {
  "16:9": "aspect-video",
  "4:3": "aspect-[4/3]",
  "1:1": "aspect-square",
};

function EmbedBlock({ src, aspect }: { src: string; aspect: string }) {
  if (!src || src === "https://") {
    return (
      <div className="border-border bg-muted/40 text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
        Embed URL not set.
      </div>
    );
  }
  const aspectClass = EMBED_ASPECT_CLASS[aspect] ?? "aspect-video";
  return (
    <div className={cn(aspectClass, "overflow-hidden rounded-md border")}>
      <iframe
        src={src}
        title="Embedded content"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}

function UnsupportedBlock({ type }: { type: string }) {
  return (
    <div className="border-border bg-muted/40 text-muted-foreground rounded-md border border-dashed px-4 py-3 text-xs">
      Block type &quot;{type}&quot; isn&apos;t rendered yet.
    </div>
  );
}
