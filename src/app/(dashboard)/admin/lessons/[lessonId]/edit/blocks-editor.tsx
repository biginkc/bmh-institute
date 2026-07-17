"use client";

import { useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Code2,
  Download,
  FileText,
  Image as ImageIcon,
  Layers3,
  Link2,
  Megaphone,
  MessagesSquare,
  Minus,
  Trash2,
  Type,
  Video,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Card, IconButton, Input } from "@/components/bmh-ds";
import { Label } from "@/components/ui/label";

import { FileUpload } from "@/components/file-upload";

import {
  createBlock,
  deleteBlock,
  moveBlock,
  updateBlock,
  type BlockType,
} from "./actions";

export type BlockRow = {
  id: string;
  block_type: string;
  content: Record<string, unknown>;
  sort_order: number;
  is_required_for_completion: boolean;
};

const ADDABLE_TYPES: { type: BlockType; label: string; icon: LucideIcon }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "video", label: "Video", icon: Video },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "pdf", label: "PDF", icon: FileText },
  { type: "audio", label: "Audio", icon: Volume2 },
  { type: "download", label: "Download", icon: Download },
  { type: "callout", label: "Callout", icon: Megaphone },
  { type: "external_link", label: "External link", icon: Link2 },
  { type: "embed", label: "Embed (iframe)", icon: Code2 },
  { type: "role_play", label: "Role play", icon: MessagesSquare },
  { type: "flashcard", label: "Flashcards", icon: Layers3 },
  { type: "divider", label: "Divider", icon: Minus },
];

export function BlocksEditor({
  lessonId,
  initialBlocks,
}: {
  lessonId: string;
  initialBlocks: BlockRow[];
}) {
  const [pending, startTransition] = useTransition();

  function onAdd(type: BlockType) {
    startTransition(async () => {
      const result = await createBlock({ lessonId, block_type: type });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Added ${type} block.`);
    });
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        {initialBlocks.length === 0 ? (
          <Card padding="md" tint>
            <p className="font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
              No blocks yet. Choose a block type to start building this lesson.
            </p>
          </Card>
        ) : (
          initialBlocks.map((block, idx) => (
            <BlockCard
              key={block.id}
              block={block}
              lessonId={lessonId}
              canMoveUp={idx > 0}
              canMoveDown={idx < initialBlocks.length - 1}
              pending={pending}
              startTransition={startTransition}
            />
          ))
        )}
      </div>

      <Card padding="md" className="lg:sticky lg:top-6">
        <h3 className="mb-2 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--ink-900)]">
          Add a block
        </h3>
        <p className="mb-4 font-[family-name:var(--font-body)] text-xs font-semibold leading-relaxed text-[var(--text-muted)]">
          Stack any mix of these 12 lesson building blocks.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ADDABLE_TYPES.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.type}
                variant="secondary"
                size="sm"
                block
                disabled={pending}
                onClick={() => onAdd(item.type)}
                iconLeft={<Icon className="size-4 accent-[var(--action)]" />}
                style={{ justifyContent: "flex-start" }}
              >
                {item.label}
              </Button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function BlockCard({
  block,
  lessonId,
  canMoveUp,
  canMoveDown,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  function onDelete() {
    if (!confirm("Delete this block?")) return;
    startTransition(async () => {
      const result = await deleteBlock({ blockId: block.id, lessonId });
      if (!result.ok) toast.error(result.error);
      else toast.success("Block removed.");
    });
  }

  function onMove(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveBlock({ blockId: block.id, lessonId, direction });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <Card padding="none">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-hairline)] px-4 py-3">
        <Badge tone="blue" size="sm">
          <span className="capitalize">{block.block_type.replaceAll("_", " ")}</span>
        </Badge>
        <div className="flex items-center gap-1">
          <IconButton
            label="Move block up"
            variant="plain"
            size="sm"
            disabled={!canMoveUp || pending}
            onClick={() => onMove("up")}
          >
            <ArrowUp className="size-4 accent-[var(--action)]" />
          </IconButton>
          <IconButton
            label="Move block down"
            variant="plain"
            size="sm"
            disabled={!canMoveDown || pending}
            onClick={() => onMove("down")}
          >
            <ArrowDown className="size-4 accent-[var(--action)]" />
          </IconButton>
          <IconButton
            label="Delete block"
            variant="plain"
            size="sm"
            disabled={pending}
            onClick={onDelete}
          >
            <Trash2 className="size-4 accent-[var(--action)]" />
          </IconButton>
        </div>
      </div>
      <div className="p-4">
        <BlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />
      </div>
    </Card>
  );
}

function BlockEditor({
  block,
  lessonId,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const blockType = block.block_type as BlockType | string;

  if (blockType === "divider") {
    return <p className="text-[var(--text-muted)] text-xs">Divider (no fields).</p>;
  }
  if (blockType === "text") {
    return <TextBlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />;
  }
  if (blockType === "callout") {
    return <CalloutBlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />;
  }
  if (blockType === "external_link") {
    return <ExternalLinkBlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />;
  }
  if (blockType === "embed") {
    return <EmbedBlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />;
  }
  if (blockType === "role_play") {
    return <RolePlayBlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />;
  }
  if (blockType === "video") {
    return <VideoBlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />;
  }
  if (blockType === "flashcard") {
    return <FlashcardBlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />;
  }
  if (blockType === "image") {
    return <ImageBlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />;
  }
  if (blockType === "pdf") {
    return <PdfBlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />;
  }
  if (blockType === "audio") {
    return <AudioBlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />;
  }
  if (blockType === "download") {
    return <DownloadBlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />;
  }
  return (
    <p className="text-[var(--text-muted)] text-xs">
      Editor for &quot;{blockType}&quot; arrives in the upload phase.
    </p>
  );
}

function useBlockSaver({
  blockId,
  lessonId,
  startTransition,
}: {
  blockId: string;
  lessonId: string;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  return function save(
    content: Record<string, unknown>,
    required?: boolean,
  ) {
    startTransition(async () => {
      const result = await updateBlock({
        blockId,
        lessonId,
        content,
        ...(typeof required === "boolean"
          ? { is_required_for_completion: required }
          : {}),
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Saved.");
    });
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function TextBlockEditor({
  block,
  lessonId,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const save = useBlockSaver({ blockId: block.id, lessonId, startTransition });
  const [html, setHtml] = useState(stringOr(block.content.html, ""));

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`html-${block.id}`}>HTML</Label>
      <textarea
        id={`html-${block.id}`}
        rows={6}
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 font-mono text-xs text-[var(--ink-900)] outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--focus-ring)]"
      />
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => save({ html })}
        >
          Save block
        </Button>
      </div>
    </div>
  );
}

function CalloutBlockEditor({
  block,
  lessonId,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const save = useBlockSaver({ blockId: block.id, lessonId, startTransition });
  const [variant, setVariant] = useState(
    stringOr(block.content.variant, "info"),
  );
  const [markdown, setMarkdown] = useState(
    stringOr(block.content.markdown, ""),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`variant-${block.id}`}>Variant</Label>
        <select
          id={`variant-${block.id}`}
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--ink-900)] outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--focus-ring)]"
        >
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="success">Success</option>
          <option value="note">Note</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`markdown-${block.id}`}>Message</Label>
        <textarea
          id={`markdown-${block.id}`}
          rows={3}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--ink-900)] outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--focus-ring)]"
        />
      </div>
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => save({ variant, markdown })}
        >
          Save block
        </Button>
      </div>
    </div>
  );
}

function ExternalLinkBlockEditor({
  block,
  lessonId,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const save = useBlockSaver({ blockId: block.id, lessonId, startTransition });
  const [url, setUrl] = useState(stringOr(block.content.url, ""));
  const [label, setLabel] = useState(stringOr(block.content.label, ""));
  const [description, setDescription] = useState(
    stringOr(block.content.description, ""),
  );
  const [openInNewTab, setOpenInNewTab] = useState(
    boolOr(block.content.open_in_new_tab, true),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`url-${block.id}`}>URL</Label>
        <Input
          id={`url-${block.id}`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`label-${block.id}`}>Label</Label>
        <Input
          id={`label-${block.id}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`desc-${block.id}`}>Description (optional)</Label>
        <Input
          id={`desc-${block.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id={`new-tab-${block.id}`}
          type="checkbox"
          checked={openInNewTab}
          onChange={(e) => setOpenInNewTab(e.target.checked)}
          className="size-4 accent-[var(--action)]"
        />
        <Label htmlFor={`new-tab-${block.id}`}>Open in new tab</Label>
      </div>
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            save({
              url,
              label,
              description,
              open_in_new_tab: openInNewTab,
            })
          }
        >
          Save block
        </Button>
      </div>
    </div>
  );
}

function VideoBlockEditor({
  block,
  lessonId,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const save = useBlockSaver({ blockId: block.id, lessonId, startTransition });
  const [source, setSource] = useState(
    stringOr(block.content.source, "upload"),
  );
  const [filePath, setFilePath] = useState(
    stringOr(block.content.file_path, ""),
  );
  const [url, setUrl] = useState(stringOr(block.content.url, ""));
  const [title, setTitle] = useState(stringOr(block.content.title, ""));
  const [partLabel, setPartLabel] = useState(stringOr(block.content.part_label, ""));
  const [posterPath, setPosterPath] = useState(stringOr(block.content.poster_path, ""));
  const [captionPath, setCaptionPath] = useState(stringOr(block.content.caption_path, ""));
  const [transcriptPath, setTranscriptPath] = useState(stringOr(block.content.transcript_path, ""));
  const [required, setRequired] = useState(block.is_required_for_completion);

  function onSave(overrides: Record<string, unknown> = {}) {
    save({
      source,
      file_path: source === "upload" ? filePath : "",
      url: source === "upload" ? "" : url,
      title,
      part_label: partLabel,
      poster_path: posterPath,
      caption_path: captionPath,
      transcript_path: transcriptPath,
      ...overrides,
    }, source === "upload" ? required : false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`source-${block.id}`}>Source</Label>
        <select
          id={`source-${block.id}`}
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            if (e.target.value !== "upload") setRequired(false);
          }}
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--ink-900)] outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--focus-ring)]"
        >
          <option value="upload">Upload (MP4/MOV/WebM)</option>
          <option value="youtube">YouTube link</option>
          <option value="vimeo">Vimeo link</option>
          <option value="loom">Loom link</option>
        </select>
      </div>

      {source === "upload" && filePath ? (
        <CompletionRequirementToggle
          blockId={block.id}
          checked={required}
          onChange={setRequired}
        />
      ) : source === "upload" ? (
        <p className="text-xs font-semibold text-[var(--text-muted)]">
          Upload a video before making it required for completion.
        </p>
      ) : (
        <p className="text-xs font-semibold text-[var(--text-muted)]">
          External videos cannot track completion and are always optional.
        </p>
      )}

      {source === "upload" ? (
        <div className="flex flex-col gap-1.5">
          <Label>Video file</Label>
          <FileUpload
            accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
            maxMb={2048}
            currentPath={filePath || null}
            onUploaded={(f) => {
              setFilePath(f.file_path);
              onSave({
                file_path: f.file_path,
                filename: f.filename,
                size_bytes: f.size_bytes,
                mime_type: f.mime_type,
              });
            }}
            label="Upload video"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`url-${block.id}`}>Video URL</Label>
          <Input
            id={`url-${block.id}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={
              source === "youtube"
                ? "https://www.youtube.com/watch?v=..."
                : source === "vimeo"
                  ? "https://vimeo.com/..."
                  : "https://www.loom.com/share/..."
            }
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`video-title-${block.id}`}>Video title</Label>
          <Input id={`video-title-${block.id}`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`part-label-${block.id}`}>Part label</Label>
          <Input id={`part-label-${block.id}`} value={partLabel} onChange={(e) => setPartLabel(e.target.value)} placeholder="Part A" />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label>Poster image</Label>
          <FileUpload
            accept="image/png,image/jpeg,image/webp"
            maxMb={20}
            label="Upload poster"
            currentPath={posterPath || null}
            onUploaded={(file) => {
              setPosterPath(file.file_path);
              onSave({ poster_path: file.file_path });
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Captions (VTT)</Label>
          <FileUpload
            accept="text/vtt,.vtt"
            maxMb={10}
            label="Upload captions"
            currentPath={captionPath || null}
            onUploaded={(file) => {
              setCaptionPath(file.file_path);
              onSave({ caption_path: file.file_path });
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Transcript</Label>
          <FileUpload
            accept="application/pdf,text/plain,text/markdown,.md"
            maxMb={50}
            label="Upload transcript"
            currentPath={transcriptPath || null}
            onUploaded={(file) => {
              setTranscriptPath(file.file_path);
              onSave({ transcript_path: file.file_path });
            }}
          />
        </div>
      </div>

      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => onSave()}
        >
          Save block
        </Button>
      </div>
    </div>
  );
}

function FlashcardBlockEditor({
  block,
  lessonId,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const save = useBlockSaver({ blockId: block.id, lessonId, startTransition });
  const [lines, setLines] = useState(() => flashcardLines(block.content.cards));

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`cards-${block.id}`}>Cards</Label>
      <textarea
        id={`cards-${block.id}`}
        rows={8}
        value={lines}
        onChange={(event) => setLines(event.target.value)}
        placeholder="Prompt | Answer"
        className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 font-mono text-xs text-[var(--ink-900)] outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--focus-ring)]"
      />
      <p className="text-xs font-semibold text-[var(--text-muted)]">
        Enter one card per line. Separate the prompt and answer with a vertical bar.
      </p>
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => save({ cards: parseFlashcardLines(lines) })}
        >
          Save cards
        </Button>
      </div>
    </div>
  );
}

function flashcardLines(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((card) => {
      if (typeof card !== "object" || card === null) return [];
      const row = card as Record<string, unknown>;
      return typeof row.front === "string" && typeof row.back === "string"
        ? [`${row.front} | ${row.back}`]
        : [];
    })
    .join("\n");
}

function parseFlashcardLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.split("|", 2).map((part) => part.trim()))
    .filter(([front, back]) => Boolean(front && back))
    .map(([front, back]) => ({ front, back }));
}

function ImageBlockEditor({
  block,
  lessonId,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const save = useBlockSaver({ blockId: block.id, lessonId, startTransition });
  const [filePath, setFilePath] = useState(
    stringOr(block.content.file_path, ""),
  );
  const [alt, setAlt] = useState(stringOr(block.content.alt, ""));
  const [caption, setCaption] = useState(stringOr(block.content.caption, ""));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Image file</Label>
        <FileUpload
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          maxMb={50}
          currentPath={filePath || null}
          onUploaded={(f) => {
            setFilePath(f.file_path);
            save({ file_path: f.file_path, alt, caption });
          }}
          label="Upload image"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`alt-${block.id}`}>Alt text</Label>
        <Input
          id={`alt-${block.id}`}
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="Describe the image for screen readers"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`cap-${block.id}`}>Caption (optional)</Label>
        <Input
          id={`cap-${block.id}`}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
      </div>
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => save({ file_path: filePath, alt, caption })}
        >
          Save block
        </Button>
      </div>
    </div>
  );
}

function PdfBlockEditor({
  block,
  lessonId,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const save = useBlockSaver({ blockId: block.id, lessonId, startTransition });
  const [filePath, setFilePath] = useState(
    stringOr(block.content.file_path, ""),
  );
  const [filename, setFilename] = useState(
    stringOr(block.content.filename, ""),
  );
  const [display, setDisplay] = useState(
    stringOr(block.content.display, "inline"),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>PDF file</Label>
        <FileUpload
          accept="application/pdf"
          maxMb={200}
          currentPath={filePath || null}
          onUploaded={(f) => {
            setFilePath(f.file_path);
            setFilename(f.filename);
            save({
              file_path: f.file_path,
              filename: f.filename,
              size_bytes: f.size_bytes,
              display,
            });
          }}
          label="Upload PDF"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`display-${block.id}`}>Display</Label>
        <select
          id={`display-${block.id}`}
          value={display}
          onChange={(e) => setDisplay(e.target.value)}
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--ink-900)] outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--focus-ring)]"
        >
          <option value="inline">Inline viewer</option>
          <option value="download">Download link</option>
        </select>
      </div>
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            save({ file_path: filePath, filename, display })
          }
        >
          Save block
        </Button>
      </div>
    </div>
  );
}

function AudioBlockEditor({
  block,
  lessonId,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const save = useBlockSaver({ blockId: block.id, lessonId, startTransition });
  const [source, setSource] = useState(
    stringOr(block.content.source, "upload"),
  );
  const [filePath, setFilePath] = useState(
    stringOr(block.content.file_path, ""),
  );
  const [url, setUrl] = useState(stringOr(block.content.url, ""));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`src-${block.id}`}>Source</Label>
        <select
          id={`src-${block.id}`}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--ink-900)] outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--focus-ring)]"
        >
          <option value="upload">Upload (MP3/M4A/WAV)</option>
          <option value="url">External URL</option>
        </select>
      </div>
      {source === "upload" ? (
        <FileUpload
          accept="audio/mpeg,audio/mp4,audio/wav,audio/x-m4a"
          maxMb={500}
          currentPath={filePath || null}
          onUploaded={(f) => {
            setFilePath(f.file_path);
            save({
              source: "upload",
              file_path: f.file_path,
              filename: f.filename,
              mime_type: f.mime_type,
              url: "",
            });
          }}
          label="Upload audio"
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`aurl-${block.id}`}>Audio URL</Label>
          <Input
            id={`aurl-${block.id}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
      )}
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            save({
              source,
              file_path: source === "upload" ? filePath : "",
              url: source === "url" ? url : "",
            })
          }
        >
          Save block
        </Button>
      </div>
    </div>
  );
}

function DownloadBlockEditor({
  block,
  lessonId,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const save = useBlockSaver({ blockId: block.id, lessonId, startTransition });
  const [filePath, setFilePath] = useState(
    stringOr(block.content.file_path, ""),
  );
  const [filename, setFilename] = useState(
    stringOr(block.content.filename, ""),
  );
  const [description, setDescription] = useState(
    stringOr(block.content.description, ""),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Downloadable file</Label>
        <FileUpload
          accept="*/*"
          maxMb={500}
          currentPath={filePath || null}
          onUploaded={(f) => {
            setFilePath(f.file_path);
            setFilename(f.filename);
            save({
              file_path: f.file_path,
              filename: f.filename,
              size_bytes: f.size_bytes,
              mime_type: f.mime_type,
              description,
            });
          }}
          label="Upload file"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`fn-${block.id}`}>Filename (as shown to learner)</Label>
        <Input
          id={`fn-${block.id}`}
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`desc-${block.id}`}>Description (optional)</Label>
        <Input
          id={`desc-${block.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => save({ file_path: filePath, filename, description })}
        >
          Save block
        </Button>
      </div>
    </div>
  );
}

function EmbedBlockEditor({
  block,
  lessonId,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const save = useBlockSaver({ blockId: block.id, lessonId, startTransition });
  const [src, setSrc] = useState(stringOr(block.content.iframe_src, ""));
  const [aspect, setAspect] = useState(
    stringOr(block.content.aspect_ratio, "16:9"),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`src-${block.id}`}>Iframe src</Label>
        <Input
          id={`src-${block.id}`}
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          placeholder="https://www.loom.com/embed/..."
        />
        <p className="text-[var(--text-muted)] text-xs">
          Admin-trusted: must start with https. The iframe is rendered with a
          sandbox attribute that blocks top-level navigation.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`aspect-${block.id}`}>Aspect ratio</Label>
        <select
          id={`aspect-${block.id}`}
          value={aspect}
          onChange={(e) => setAspect(e.target.value)}
          className="w-full rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--ink-900)] outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--focus-ring)]"
        >
          <option value="16:9">16:9</option>
          <option value="4:3">4:3</option>
          <option value="1:1">1:1</option>
        </select>
      </div>
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => save({ iframe_src: src, aspect_ratio: aspect })}
        >
          Save block
        </Button>
      </div>
    </div>
  );
}

function RolePlayBlockEditor({
  block,
  lessonId,
  pending,
  startTransition,
}: {
  block: BlockRow;
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const save = useBlockSaver({ blockId: block.id, lessonId, startTransition });
  const [scenarioId, setScenarioId] = useState(
    stringOr(block.content.scenario_id, ""),
  );
  const [title, setTitle] = useState(stringOr(block.content.title, "Role play"));
  const [heightPx, setHeightPx] = useState(
    String(numberOr(block.content.height_px, 720)),
  );
  const [required, setRequired] = useState(block.is_required_for_completion);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`rp-scenario-${block.id}`}>Scenario ID</Label>
        <Input
          id={`rp-scenario-${block.id}`}
          value={scenarioId}
          onChange={(e) => setScenarioId(e.target.value)}
          placeholder="2da3a001-2dc6-467a-bfa3-af3665ee311c"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`rp-title-${block.id}`}>Title</Label>
        <Input
          id={`rp-title-${block.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Handle the price objection"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`rp-height-${block.id}`}>Initial height</Label>
        <Input
          id={`rp-height-${block.id}`}
          type="number"
          min={360}
          max={1400}
          value={heightPx}
          onChange={(e) => setHeightPx(e.target.value)}
        />
      </div>
      {scenarioId.trim() ? (
        <CompletionRequirementToggle
          blockId={block.id}
          checked={required}
          onChange={setRequired}
        />
      ) : (
        <p className="text-xs font-semibold text-[var(--text-muted)]">
          Add a scenario ID before making this role play required.
        </p>
      )}
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            save(
              {
                scenario_id: scenarioId,
                title,
                height_px: Number(heightPx) || 720,
              },
              required,
            )
          }
        >
          Save block
        </Button>
      </div>
    </div>
  );
}

function CompletionRequirementToggle({
  blockId,
  checked,
  onChange,
}: {
  blockId: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={`required-${blockId}`}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--action)]"
      />
      <Label htmlFor={`required-${blockId}`}>
        Required for lesson completion
      </Label>
    </div>
  );
}
