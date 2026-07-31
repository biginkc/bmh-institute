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
  /**
   * True only for a video part whose prior completion was invalidated by a
   * content update (the underlying file/duration changed after the learner
   * finished it) — never for a part that was simply never started. Lets the
   * UI say *why* progress reset instead of presenting an ordinary lock.
   */
  invalidated: boolean;
};

export type LearnerLessonPartsInput = {
  blocks: ContentBlock[];
  completedBlockIds: Set<string>;
  quizComplete: boolean;
  quizUnlocked: boolean;
  compositeComplete: boolean;
  includeQuiz?: boolean;
  /**
   * Video blocks with a `user_block_progress` row whose `asset_version` no
   * longer matches the block's current file/duration — i.e. the learner
   * completed an older version of this video before its file was swapped.
   * Optional/defaulted so existing callers that never invalidate anything
   * don't need to change.
   */
  invalidatedBlockIds?: Set<string>;
};

const ACTIONABLE_TYPES = new Set<ContentBlock["block_type"]>([
  "video",
  "role_play",
]);

/**
 * An oral check is a `role_play` block whose persona is Andrea-the-coach
 * rather than a Closer Lab sales scenario. Content-only marker (no schema
 * change) so the completion contract, embed plumbing, and gating are all
 * reused as-is; only the learner-facing label differs.
 */
export function isOralCheckBlock(block: ContentBlock): boolean {
  return block.block_type === "role_play" && block.content?.mode === "oral_check";
}

function rolePlayLabelBase(block: ContentBlock): string {
  return isOralCheckBlock(block) ? "Talk with Andrea" : "Role play";
}

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
  const rolePlayBlocks = actionable.filter((block) => block.block_type === "role_play");
  // Counted per label group (plain role-plays vs oral checks) so each group
  // gets its own A/B/C lettering. Today a lesson never mixes the two, so this
  // only ever produces a bare label, but it stays correct if that changes.
  const rolePlayGroupCounts = new Map<string, number>();
  for (const block of rolePlayBlocks) {
    const key = rolePlayLabelBase(block);
    rolePlayGroupCounts.set(key, (rolePlayGroupCounts.get(key) ?? 0) + 1);
  }
  const rolePlayGroupIndex = new Map<string, number>();
  let videoIndex = 0;
  let rolePlayIndex = 0;
  let priorComplete = true;
  const parts: LearnerLessonPart[] = [];

  for (const block of actionable) {
    const video = block.block_type === "video";
    const index = video ? ++videoIndex : ++rolePlayIndex;
    let label: string;
    if (video) {
      label = partLabel("Video", index, videoCount);
    } else {
      const key = rolePlayLabelBase(block);
      const groupIndex = (rolePlayGroupIndex.get(key) ?? 0) + 1;
      rolePlayGroupIndex.set(key, groupIndex);
      label = partLabel(key, groupIndex, rolePlayGroupCounts.get(key) ?? 1);
    }
    // These are deliberately different things. `done` is genuine learner
    // completion — the only thing that should ever render a "Complete" badge
    // or a rail checkmark, or make the "continue learning" pointer skip past
    // this part (below). `gateSatisfied` additionally treats a non-required
    // block as satisfied, but ONLY to decide whether LATER parts unlock — an
    // optional block should never block progress, but skipping it is not the
    // same as doing it. Collapsing these into one flag previously made every
    // optional role play read "Complete" before a learner had ever attempted
    // it, which defeats the entire point of asking someone to test one.
    const done = input.completedBlockIds.has(block.id);
    const gateSatisfied = !block.is_required_for_completion || done;
    // A part the learner has genuinely completed must always stay openable,
    // even if a later content update invalidated an EARLIER part's
    // completion and regressed `priorComplete` for everything after it. The
    // upstream gate still governs parts that were never completed — this
    // only widens `available` for a part that is itself already done.
    const invalidated =
      video && !done && (input.invalidatedBlockIds?.has(block.id) ?? false);
    const blocks = [block];
    if (video && index === 1) blocks.push(...support);
    parts.push({
      id: `${video ? "video" : "role-play"}-${index}`,
      label,
      kind: video ? "video" : "role_play",
      blocks,
      complete: done,
      available: priorComplete || done,
      invalidated,
    });
    priorComplete = priorComplete && gateSatisfied;
  }

  if (actionable.length === 0 && support.length > 0) {
    parts.push({
      id: "lesson",
      label: "Lesson",
      kind: "lesson",
      blocks: support,
      complete: true,
      available: true,
      invalidated: false,
    });
  }

  if (input.includeQuiz !== false) {
    parts.push({
      id: "quiz",
      label: "Quiz",
      kind: "quiz",
      blocks: [],
      complete: input.quizComplete,
      // Same rule as above: a completed quiz must stay revisitable even if
      // an earlier part's completion later got invalidated.
      available: (priorComplete && input.quizUnlocked) || input.quizComplete,
      invalidated: false,
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
      invalidated: false,
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

export type LearnerPartResolution = {
  part: LearnerLessonPart | null;
  requestedPart: string | null;
  requestedPartValid: boolean;
  requestedPartLocked: boolean;
  canonicalPartId: string | null;
};

/**
 * A locked request must only lock the part that was actually requested. A
 * locked non-quiz request can otherwise fall back to another selected part
 * during preparation, and incorrectly render that fallback as locked.
 */
export function shouldRenderLearnerPartLock(input: {
  requestedPartLocked: boolean;
  requestedPartId: string | null;
  selectedPartId: string;
}): boolean {
  return (
    input.requestedPartLocked && input.requestedPartId === input.selectedPartId
  );
}

/** Resolve routing without letting an unknown value or a forged locked part skip work. */
export function resolveLearnerPart(
  parts: LearnerLessonPart[],
  requestedPartId: string | null,
): LearnerPartResolution {
  const requested = parts.find((part) => part.id === requestedPartId);
  const fallback = selectLearnerPart(parts, null);
  const part = requested ?? fallback;
  return {
    part,
    requestedPart: requestedPartId,
    requestedPartValid: Boolean(requested),
    requestedPartLocked: Boolean(requested && !requested.available),
    canonicalPartId: part?.id ?? null,
  };
}

function partLabel(base: string, index: number, count: number): string {
  if (count <= 1) return base;
  return `${base} ${String.fromCharCode(64 + index)}`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
