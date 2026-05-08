"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const ADDABLE_TYPES: { type: BlockType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "video", label: "Video" },
  { type: "image", label: "Image" },
  { type: "pdf", label: "PDF" },
  { type: "audio", label: "Audio" },
  { type: "download", label: "Download" },
  { type: "callout", label: "Callout" },
  { type: "external_link", label: "External link" },
  { type: "embed", label: "Embed (iframe)" },
  { type: "role_play", label: "Role play" },
  { type: "divider", label: "Divider" },
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
    <div className="flex flex-col gap-4">
      {initialBlocks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No blocks yet. Add one below.
        </p>
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

      <div className="border-border flex flex-wrap items-center gap-2 border-t pt-4">
        <span className="text-muted-foreground text-xs">Add block:</span>
        {ADDABLE_TYPES.map((t) => (
          <Button
            key={t.type}
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onAdd(t.type)}
          >
            {t.label}
          </Button>
        ))}
      </div>
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
    <div className="border-border rounded-md border">
      <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
        <Badge variant="secondary" className="capitalize">
          {block.block_type}
        </Badge>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!canMoveUp || pending}
            onClick={() => onMove("up")}
            aria-label="Move up"
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!canMoveDown || pending}
            onClick={() => onMove("down")}
            aria-label="Move down"
          >
            <ArrowDown className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pending}
            onClick={onDelete}
            aria-label="Delete block"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="p-3">
        <BlockEditor block={block} lessonId={lessonId} pending={pending} startTransition={startTransition} />
      </div>
    </div>
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
    return <p className="text-muted-foreground text-xs">Divider (no fields).</p>;
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
    <p className="text-muted-foreground text-xs">
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
  return function save(content: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updateBlock({ blockId, lessonId, content });
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
        className="border-input bg-background w-full rounded-md border px-3 py-2 font-mono text-xs"
      />
      <div>
        <Button
          variant="outline"
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
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
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
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <Button
          variant="outline"
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
          className="size-4"
        />
        <Label htmlFor={`new-tab-${block.id}`}>Open in new tab</Label>
      </div>
      <div>
        <Button
          variant="outline"
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

  function onSave() {
    save({
      source,
      file_path: source === "upload" ? filePath : "",
      url: source === "upload" ? "" : url,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`source-${block.id}`}>Source</Label>
        <select
          id={`source-${block.id}`}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="upload">Upload (MP4/MOV/WebM)</option>
          <option value="youtube">YouTube link</option>
          <option value="vimeo">Vimeo link</option>
          <option value="loom">Loom link</option>
        </select>
      </div>

      {source === "upload" ? (
        <div className="flex flex-col gap-1.5">
          <Label>Video file</Label>
          <FileUpload
            accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
            maxMb={2048}
            currentPath={filePath || null}
            onUploaded={(f) => {
              setFilePath(f.file_path);
              save({
                source: "upload",
                file_path: f.file_path,
                filename: f.filename,
                size_bytes: f.size_bytes,
                mime_type: f.mime_type,
                url: "",
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

      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onSave}
        >
          Save block
        </Button>
      </div>
    </div>
  );
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
          variant="outline"
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
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="inline">Inline viewer</option>
          <option value="download">Download link</option>
        </select>
      </div>
      <div>
        <Button
          variant="outline"
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
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
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
          variant="outline"
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
          variant="outline"
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
        <p className="text-muted-foreground text-xs">
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
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="16:9">16:9</option>
          <option value="4:3">4:3</option>
          <option value="1:1">1:1</option>
        </select>
      </div>
      <div>
        <Button
          variant="outline"
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
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            save({
              scenario_id: scenarioId,
              title,
              height_px: Number(heightPx) || 720,
            })
          }
        >
          Save block
        </Button>
      </div>
    </div>
  );
}
