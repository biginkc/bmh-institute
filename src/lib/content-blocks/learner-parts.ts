import type { ContentBlock } from "@/components/content-blocks";

export type LearnerLessonPartKind =
  | "video"
  | "role_play"
  | "quiz"
  | "guide"
  | "lesson";

export type LearnerLessonPart = {
  id: string;
  label: string;
  kind: LearnerLessonPartKind;
  blocks: ContentBlock[];
  complete: boolean;
  available: boolean;
};

export type LearnerLessonPartsInput = {
  blocks: ContentBlock[];
  completedBlockIds: Set<string>;
  quizComplete: boolean;
  quizUnlocked: boolean;
  compositeComplete: boolean;
  includeQuiz?: boolean;
};

const ACTIONABLE_TYPES = new Set<ContentBlock["block_type"]>([
  "video",
  "role_play",
]);

/**
 * Partitions every learner block exactly once. Objectives and flashcards are
 * intentionally hidden. Guides are held for the final post-pass part. All
 * remaining support blocks are attached to the first video or a fallback
 * Lesson part so they cannot disappear between render paths.
 */
export function buildLearnerLessonParts(
  input: LearnerLessonPartsInput,
): LearnerLessonPart[] {
  const sorted = [...input.blocks].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
  );
  const visible = sorted.filter(
    (block) => block.block_type !== "flashcard" && !isObjectivesBlock(block),
  );
  const guides = visible.filter(isGuideBlock);
  const actionable = visible.filter(
    (block) => ACTIONABLE_TYPES.has(block.block_type) && !isGuideBlock(block),
  );
  const support = visible.filter(
    (block) => !ACTIONABLE_TYPES.has(block.block_type) && !isGuideBlock(block),
  );
  const videoCount = actionable.filter((block) => block.block_type === "video").length;
  const rolePlayCount = actionable.filter(
    (block) => block.block_type === "role_play",
  ).length;
  let videoIndex = 0;
  let rolePlayIndex = 0;
  let priorComplete = true;
  const parts: LearnerLessonPart[] = [];

  for (const block of actionable) {
    const video = block.block_type === "video";
    const index = video ? ++videoIndex : ++rolePlayIndex;
    const count = video ? videoCount : rolePlayCount;
    const complete =
      !block.is_required_for_completion || input.completedBlockIds.has(block.id);
    const blocks = [block];
    if (video && index === 1) blocks.push(...support);
    parts.push({
      id: `${video ? "video" : "role-play"}-${index}`,
      label: partLabel(video ? "Video" : "Role play", index, count),
      kind: video ? "video" : "role_play",
      blocks,
      complete,
      available: priorComplete,
    });
    priorComplete = priorComplete && complete;
  }

  if (actionable.length === 0 && support.length > 0) {
    parts.push({
      id: "lesson",
      label: "Lesson",
      kind: "lesson",
      blocks: support,
      complete: true,
      available: true,
    });
  }

  if (input.includeQuiz !== false) {
    parts.push({
      id: "quiz",
      label: "Quiz",
      kind: "quiz",
      blocks: [],
      complete: input.quizComplete,
      available: priorComplete && input.quizUnlocked,
    });
  }
  if (guides.length > 0) {
    parts.push({
      id: "guide",
      label: "Guide",
      kind: "guide",
      blocks: guides,
      complete: input.compositeComplete,
      available: input.compositeComplete,
    });
  }

  return parts;
}

export function isGuideBlock(block: ContentBlock): boolean {
  if (block.block_type === "text") {
    const html = stringValue(block.content.html);
    return /<h[1-6][^>]*>\s*learner\s+guide\s*<\/h[1-6]>/i.test(html);
  }
  if (block.block_type !== "pdf" && block.block_type !== "download") {
    return false;
  }
  const values = [
    block.content.title,
    block.content.filename,
    block.content.description,
  ].map(stringValue);
  const path = stringValue(block.content.file_path).replace(/\\/g, "/");
  return (
    values.some((value) => /\blearner[\s_-]+guide\b/i.test(value)) ||
    /(^|\/)guides\//i.test(path) ||
    /\blearner[\s_-]+guide\b/i.test(path)
  );
}

export function isObjectivesBlock(block: ContentBlock): boolean {
  if (block.block_type !== "text") return false;
  return /<h[1-6][^>]*>\s*what\s+you(?:\s+will|(?:'|&(?:#39|apos);)?ll)\s+learn\s*<\/h[1-6]>/i.test(
    stringValue(block.content.html),
  );
}

export function partIdForBlock(
  blocks: ContentBlock[],
  blockId: string | null,
): string | null {
  if (!blockId) return null;
  const sorted = [...blocks].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
  );
  let videoIndex = 0;
  let rolePlayIndex = 0;
  for (const block of sorted) {
    if (block.block_type === "video") videoIndex += 1;
    if (block.block_type === "role_play") rolePlayIndex += 1;
    if (block.id !== blockId) continue;
    if (block.block_type === "video") return `video-${videoIndex}`;
    if (block.block_type === "role_play") return `role-play-${rolePlayIndex}`;
    if (isGuideBlock(block)) return "guide";
    return firstActionablePartId(sorted);
  }
  return null;
}

export function firstActionablePartId(blocks: ContentBlock[]): string {
  if (blocks.some((block) => block.block_type === "video")) return "video-1";
  if (blocks.some((block) => block.block_type === "role_play")) return "role-play-1";
  return "lesson";
}

/** Prevents a forged ?part= value from skipping a locked prerequisite. */
export function selectLearnerPart(
  parts: LearnerLessonPart[],
  requestedPartId: string | null,
): LearnerLessonPart | null {
  const requested = parts.find((part) => part.id === requestedPartId);
  if (requested?.available) return requested;
  return (
    parts.find((part) => part.available && !part.complete) ??
    parts.find((part) => part.available) ??
    null
  );
}

function partLabel(base: string, index: number, count: number): string {
  if (count <= 1) return base;
  return `${base} ${String.fromCharCode(64 + index)}`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
