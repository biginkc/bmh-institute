import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileAudio,
  FileText,
  Info,
  Lightbulb,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { sanitizeTextBlockHtml } from "@/lib/sanitize/text-block";
import { RolePlayBlock } from "./role-play-block";
import { VideoBlockPlayer } from "./video-block-player";
import { FlashcardBlock, type Flashcard } from "./flashcard-block";

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
    | "role_play"
    | "divider"
    | "callout"
    | "flashcard";
  content: Record<string, unknown>;
  sort_order: number;
  is_required_for_completion: boolean;
};

export function ContentBlockRenderer({
  block,
  completed = false,
}: {
  block: ContentBlock;
  completed?: boolean;
}) {
  return (
    <div data-content-block={block.block_type} className="w-full">
      {renderContentBlock(block, completed)}
    </div>
  );
}

function renderContentBlock(block: ContentBlock, completed: boolean) {
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
      return <hr className="my-6 border-0 border-t border-[var(--border-hairline)]" />;
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
          initialComplete={completed}
          source={stringOr(block.content.source, "upload")}
          signedUrl={stringOr(block.content.signed_url, null)}
          url={stringOr(block.content.url, null)}
          filePath={stringOr(block.content.file_path, null)}
          posterSignedUrl={stringOr(block.content.poster_signed_url, null)}
          captionSignedUrl={stringOr(block.content.caption_signed_url, null)}
          transcriptSignedUrl={stringOr(block.content.transcript_signed_url, null)}
          title={stringOr(block.content.title, "")}
          partLabel={stringOr(block.content.part_label, "")}
        />
      );
    case "embed":
      return (
        <EmbedBlock
          src={stringOr(block.content.iframe_src, "")}
          aspect={stringOr(block.content.aspect_ratio, "16:9")}
        />
      );
    case "role_play":
      return (
        <RolePlayBlock
          blockId={block.id}
          scenarioId={stringOr(block.content.scenario_id, "")}
          title={stringOr(block.content.title, "Role play")}
          iframeSrc={stringOr(block.content.iframe_src, "")}
          initialHeightPx={numberOr(block.content.height_px, 720)}
          initialComplete={completed}
        />
      );
    case "flashcard":
      return <FlashcardBlock cards={flashcardsOrEmpty(block.content.cards)} />;
    default:
      return <UnsupportedBlock type={block.block_type} />;
  }
}

function flashcardsOrEmpty(value: unknown): Flashcard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((card) => {
    if (
      typeof card === "object" &&
      card !== null &&
      typeof (card as Record<string, unknown>).front === "string" &&
      typeof (card as Record<string, unknown>).back === "string"
    ) {
      return [
        {
          front: (card as Record<string, string>).front,
          back: (card as Record<string, string>).back,
        },
      ];
    }
    return [];
  });
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

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function TextBlock({ html }: { html: string }) {
  const safeHtml = sanitizeTextBlockHtml(html);
  return (
    <div
      className="prose prose-neutral max-w-none font-[family-name:var(--font-body)] text-[15px] leading-relaxed font-semibold text-[var(--text-body)] [&_a]:font-extrabold [&_a]:text-[var(--action)] [&_blockquote]:rounded-r-[var(--bmh-radius-md)] [&_blockquote]:border-l-4 [&_blockquote]:border-[var(--action)] [&_blockquote]:bg-[var(--surface-tint)] [&_blockquote]:px-5 [&_blockquote]:py-3 [&_blockquote]:text-[var(--ink-700)] [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:font-[family-name:var(--font-display)] [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-[var(--ink-900)] [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-[family-name:var(--font-display)] [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-[var(--ink-900)] [&_li]:my-1 [&_p]:mb-4 [&_strong]:font-extrabold [&_strong]:text-[var(--ink-900)]"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}

const CALLOUT_CLASSES: Record<string, string> = {
  info: "border-[var(--blue-200)] bg-[var(--action-soft)] text-[var(--blue-700)]",
  warning: "border-[var(--yellow-300)] bg-[var(--warning-soft)] text-[var(--yellow-600)]",
  success: "border-[var(--green-500)] bg-[var(--success-soft)] text-[var(--green-500)]",
  note: "border-[var(--ink-200)] bg-[var(--ink-050)] text-[var(--ink-700)]",
};

const CALLOUT_ICONS = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
  note: Lightbulb,
};

function CalloutBlock({
  variant,
  markdown,
}: {
  variant: string;
  markdown: string;
}) {
  const cls = CALLOUT_CLASSES[variant] ?? CALLOUT_CLASSES.note;
  const Icon = CALLOUT_ICONS[variant as keyof typeof CALLOUT_ICONS] ?? Lightbulb;
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-[var(--bmh-radius-md)] border px-4 py-4 font-[family-name:var(--font-body)] text-sm font-bold shadow-[var(--bmh-shadow-xs)]",
        cls,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span className="leading-relaxed text-[var(--ink-900)]">{markdown}</span>
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
    "group flex items-center gap-3 rounded-[var(--bmh-radius-md)] border border-[var(--border-card)] bg-[var(--surface-card)] px-4 py-4 font-[family-name:var(--font-body)] text-sm shadow-[var(--bmh-shadow-xs)] transition-all hover:-translate-y-0.5 hover:border-[var(--blue-300)] hover:shadow-[var(--shadow-pop)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]";
  const content = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--action-soft)] text-[var(--action)]">
        <ExternalLink aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-extrabold text-[var(--ink-900)]">{label}</div>
        {description ? (
          <div className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">
            {description}
          </div>
        ) : null}
      </div>
      <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
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
      <div className="rounded-[var(--bmh-radius-md)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-050)] p-6 text-center text-sm font-semibold text-[var(--text-muted)]">
        Image not set.
      </div>
    );
  }
  return (
    <figure className="my-2 overflow-hidden rounded-[var(--bmh-radius-lg)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--bmh-shadow-sm)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-auto w-full" />
      {caption ? (
        <figcaption className="border-t border-[var(--border-hairline)] px-4 py-3 font-[family-name:var(--font-body)] text-xs font-semibold text-[var(--text-muted)]">
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
      <div className="rounded-[var(--bmh-radius-md)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-050)] p-6 text-center text-sm font-semibold text-[var(--text-muted)]">
        PDF not set.
      </div>
    );
  }

  if (display === "download") {
    return (
      <a
        href={src}
        download={filename ?? undefined}
        aria-label={`Download ${filename ?? "PDF"}`}
        className="flex items-center gap-3 rounded-[var(--bmh-radius-md)] border border-[var(--border-card)] bg-[var(--surface-card)] px-4 py-4 font-[family-name:var(--font-body)] text-sm shadow-[var(--bmh-shadow-xs)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-[var(--action-soft)] text-[var(--action)]">
          <FileText aria-hidden="true" className="size-5" />
        </span>
        <div>
          <div className="font-extrabold text-[var(--ink-900)]">{filename ?? "Download PDF"}</div>
          <div className="text-xs font-semibold text-[var(--text-muted)]">PDF document</div>
        </div>
      </a>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--bmh-radius-lg)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--bmh-shadow-sm)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--ink-900)]">
        <FileText aria-hidden="true" className="size-4 text-[var(--action)]" />
        {filename ?? "PDF document"}
      </div>
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
      <div className="rounded-[var(--bmh-radius-md)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-050)] p-6 text-center text-sm font-semibold text-[var(--text-muted)]">
        Audio not set.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4 rounded-[var(--bmh-radius-lg)] border border-[var(--border-card)] bg-[var(--surface-card)] p-4 shadow-[var(--bmh-shadow-sm)]">
      <span className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-[var(--action-soft)] text-[var(--action)] sm:flex">
        <FileAudio aria-hidden="true" className="size-5" />
      </span>
      <audio
        src={src}
        controls
        preload="metadata"
        aria-label="Lesson audio"
        className="w-full"
      />
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
      <div className="rounded-[var(--bmh-radius-md)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-050)] p-6 text-center text-sm font-semibold text-[var(--text-muted)]">
        File not set.
      </div>
    );
  }
  return (
    <a
      href={href}
      download={filename}
      aria-label={`Download ${filename}`}
      className="group flex items-center gap-3 rounded-[var(--bmh-radius-md)] border border-[var(--border-card)] bg-[var(--surface-card)] px-4 py-4 font-[family-name:var(--font-body)] text-sm shadow-[var(--bmh-shadow-xs)] transition-all hover:-translate-y-0.5 hover:border-[var(--blue-300)] hover:shadow-[var(--shadow-pop)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--yellow-100)] text-[var(--yellow-600)]">
        <Download aria-hidden="true" className="size-5" />
      </span>
      <div className="flex-1">
        <div className="font-extrabold text-[var(--ink-900)]">{filename}</div>
        <div className="text-xs font-semibold text-[var(--text-muted)]">
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
  initialComplete,
  source,
  signedUrl,
  url,
  filePath,
  posterSignedUrl,
  captionSignedUrl,
  transcriptSignedUrl,
  title,
  partLabel,
}: {
  blockId: string;
  initialComplete: boolean;
  source: string;
  signedUrl: string | null;
  url: string | null;
  filePath: string | null;
  posterSignedUrl: string | null;
  captionSignedUrl: string | null;
  transcriptSignedUrl: string | null;
  title: string;
  partLabel: string;
}) {
  const accessibleName = [partLabel, title].filter(Boolean).join(": ") || "Lesson video";
  const player = source === "upload" ? (() => {
    const src = signedUrl ?? filePath;
    if (!src) {
      return (
        <div className="rounded-[var(--bmh-radius-md)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-050)] p-6 text-center text-sm font-semibold text-[var(--text-muted)]">
          Video not available.
        </div>
      );
    }
    return (
      <VideoBlockPlayer
        blockId={blockId}
        src={src}
        initialComplete={initialComplete}
        title={accessibleName}
        posterSrc={posterSignedUrl ?? undefined}
        captionsSrc={captionSignedUrl ?? undefined}
        transcriptSrc={transcriptSignedUrl ?? undefined}
      />
    );
  })() : (() => {
    if (!url) {
      return (
        <div className="rounded-[var(--bmh-radius-md)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-050)] p-6 text-center text-sm font-semibold text-[var(--text-muted)]">
          Video URL not set.
        </div>
      );
    }
    return (
      <div className="aspect-video overflow-hidden rounded-[var(--bmh-radius-lg)] border-[2.5px] border-[var(--ink-900)] bg-[var(--ink-900)] shadow-[var(--bmh-shadow-sm)]">
        <iframe
          src={toEmbedSrc(source, url)}
          title={accessibleName}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    );
  })();

  return (
    <section aria-labelledby={title ? `video-title-${blockId}` : undefined} className="space-y-3">
      {title || partLabel ? (
        <header>
          {partLabel ? (
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--action)]">
              {partLabel}
            </p>
          ) : null}
          {title ? (
            <h2
              id={`video-title-${blockId}`}
              className="font-[family-name:var(--font-display)] text-xl font-extrabold text-[var(--ink-900)]"
            >
              {title}
            </h2>
          ) : null}
        </header>
      ) : null}
      {player}
    </section>
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
      <div className="rounded-[var(--bmh-radius-md)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-050)] p-6 text-center text-sm font-semibold text-[var(--text-muted)]">
        Embed URL not set.
      </div>
    );
  }
  const aspectClass = EMBED_ASPECT_CLASS[aspect] ?? "aspect-video";
  return (
    <div className={cn(aspectClass, "overflow-hidden rounded-[var(--bmh-radius-lg)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--bmh-shadow-sm)]")}>
      <iframe
        src={src}
        title="Embedded content"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}

function UnsupportedBlock({ type }: { type: string }) {
  return (
    <div className="rounded-[var(--bmh-radius-md)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-050)] px-4 py-3 text-xs font-semibold text-[var(--text-muted)]">
      Block type &quot;{type}&quot; isn&apos;t rendered yet.
    </div>
  );
}
