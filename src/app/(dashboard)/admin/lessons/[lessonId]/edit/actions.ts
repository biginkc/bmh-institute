"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { validateArtworkChange } from "@/lib/artwork/paths";
import { sanitizeTextBlockHtml } from "@/lib/sanitize/text-block";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateLessonDetails(input: {
  lessonId: string;
  title: string;
  description: string | null;
  is_required_for_completion: boolean;
  thumbnail_path: string | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };
  const thumbnailPath = input.thumbnail_path?.trim() || null;
  const supabase = await createClient();
  const current = await supabase
    .from("lessons")
    .select("thumbnail_path, content_import_id")
    .eq("id", input.lessonId)
    .maybeSingle();
  if (current.error || !current.data) {
    return { ok: false, error: "Couldn't verify the lesson artwork." };
  }
  const artworkError = validateArtworkChange({
    entityType: "lesson",
    entityId: input.lessonId,
    contentImportId: current.data.content_import_id,
    currentPath: current.data.thumbnail_path,
    nextPath: thumbnailPath,
  });
  if (artworkError) return { ok: false, error: artworkError };
  const { error } = await supabase
    .from("lessons")
    .update({
      title,
      description: input.description,
      is_required_for_completion: input.is_required_for_completion,
      thumbnail_path: thumbnailPath,
    })
    .eq("id", input.lessonId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export type BlockType =
  | "text"
  | "callout"
  | "external_link"
  | "embed"
  | "role_play"
  | "divider"
  | "video"
  | "pdf"
  | "image"
  | "audio"
  | "download"
  | "flashcard";

const DEFAULT_CONTENT: Record<BlockType, Json> = {
  text: { html: "<p>Start writing...</p>" },
  callout: { variant: "info", markdown: "Heads up." },
  external_link: {
    url: "https://",
    label: "Resource",
    description: "",
    open_in_new_tab: true,
  },
  embed: { iframe_src: "https://", aspect_ratio: "16:9" },
  role_play: { scenario_id: "", title: "Role play", height_px: 720 },
  divider: {},
  video: { source: "upload", file_path: "", url: "" },
  pdf: { file_path: "", filename: "", display: "inline" },
  image: { file_path: "", alt: "", caption: "" },
  audio: { source: "upload", file_path: "", url: "" },
  download: { file_path: "", filename: "", size_bytes: 0, description: "" },
  flashcard: { cards: [{ front: "Term", back: "Definition" }] },
};

export async function createBlock(input: {
  lessonId: string;
  block_type: BlockType;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("content_blocks")
    .select("sort_order")
    .eq("lesson_id", input.lessonId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = last ? (last.sort_order as number) + 1 : 0;

  const { error } = await supabase.from("content_blocks").insert({
    lesson_id: input.lessonId,
    block_type: input.block_type,
    content: DEFAULT_CONTENT[input.block_type],
    sort_order: nextOrder,
    is_required_for_completion: input.block_type !== "divider",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}

export async function updateBlock(input: {
  blockId: string;
  lessonId: string;
  content: Record<string, unknown>;
  is_required_for_completion?: boolean;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: existing, error: lookupError } = await supabase
    .from("content_blocks")
    .select("block_type")
    .eq("id", input.blockId)
    .maybeSingle();
  if (lookupError) return { ok: false, error: lookupError.message };
  if (!existing) return { ok: false, error: "Block not found." };

  let safeContent: Json = input.content as Json;
  if (existing.block_type === "text" && typeof input.content.html === "string") {
    safeContent = {
      ...input.content,
      html: sanitizeTextBlockHtml(input.content.html),
    } as Json;
  } else if (
    existing.block_type === "embed" &&
    typeof input.content.iframe_src === "string"
  ) {
    const src = input.content.iframe_src.trim();
    if (!src.startsWith("https://")) {
      return { ok: false, error: "Embed URL must start with https://" };
    }
    safeContent = { ...input.content, iframe_src: src } as Json;
  } else if (existing.block_type === "role_play") {
    const scenarioId =
      typeof input.content.scenario_id === "string"
        ? input.content.scenario_id.trim()
        : "";
    if (!scenarioId) {
      return { ok: false, error: "Scenario ID is required." };
    }
    safeContent = {
      ...input.content,
      scenario_id: scenarioId,
      title:
        typeof input.content.title === "string"
          ? input.content.title.trim()
          : "Role play",
      height_px:
        typeof input.content.height_px === "number"
          ? input.content.height_px
          : 720,
    } as Json;
  }

  const patch: { content: Json; is_required_for_completion?: boolean } = {
    content: safeContent,
  };
  if (typeof input.is_required_for_completion === "boolean") {
    patch.is_required_for_completion = input.is_required_for_completion;
  }
  const { error } = await supabase
    .from("content_blocks")
    .update(patch)
    .eq("id", input.blockId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}

export async function deleteBlock(input: {
  blockId: string;
  lessonId: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("content_blocks")
    .delete()
    .eq("id", input.blockId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}

export async function moveBlock(input: {
  blockId: string;
  lessonId: string;
  direction: "up" | "down";
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: blocks } = await supabase
    .from("content_blocks")
    .select("id, sort_order")
    .eq("lesson_id", input.lessonId)
    .order("sort_order");

  const list = (blocks ?? []) as { id: string; sort_order: number }[];
  const idx = list.findIndex((b) => b.id === input.blockId);
  if (idx < 0) return { ok: false, error: "Block not found." };

  const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true };

  const current = list[idx];
  const neighbor = list[swapIdx];
  const tmp = -1 - idx;
  await supabase
    .from("content_blocks")
    .update({ sort_order: tmp })
    .eq("id", current.id);
  await supabase
    .from("content_blocks")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbor.id);
  await supabase
    .from("content_blocks")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", current.id);

  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}
