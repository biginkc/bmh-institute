import type { ContentBlock } from "@/components/content-blocks";
import {
  selectLearnerPart,
  type LearnerLessonPart,
} from "@/lib/content-blocks/learner-parts";

export async function prepareLearnerPart({
  parts,
  requestedPart,
  signBlocks,
  attachEmbeds,
}: {
  parts: LearnerLessonPart[];
  requestedPart: string | null;
  signBlocks: (blocks: ContentBlock[]) => Promise<ContentBlock[]>;
  attachEmbeds: (blocks: ContentBlock[]) => Promise<ContentBlock[]>;
}): Promise<LearnerLessonPart | null> {
  // An explicit part URL must never silently switch to another part. Apart
  // from being surprising, that fallback could prepare a role-play embed when
  // a caller supplied a malformed or still-locked part id. The selector still
  // owns the normal no-query/default behavior and prerequisite-safe selection.
  if (requestedPart !== null) {
    const requested = parts.find((part) => part.id === requestedPart);
    if (!requested || !requested.available) return null;
  }
  const selected = selectLearnerPart(parts, requestedPart);
  if (!selected || selected.blocks.length === 0) return selected;
  const signedBlocks = await signBlocks(selected.blocks);
  return { ...selected, blocks: await attachEmbeds(signedBlocks) };
}
