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
  const selected = selectLearnerPart(parts, requestedPart);
  if (!selected || selected.blocks.length === 0) return selected;
  const signedBlocks = await signBlocks(selected.blocks);
  return { ...selected, blocks: await attachEmbeds(signedBlocks) };
}
