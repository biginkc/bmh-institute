import type { ContentBlock } from "@/components/content-blocks";
import {
  resolveLearnerPart,
  selectLearnerPart,
  type LearnerLessonPart,
  type LearnerPartResolution,
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

export type LearnerPartSelection = {
  resolution: LearnerPartResolution;
  selected: LearnerLessonPart | null;
};

/**
 * The single decision point the lesson page delegates to for turning a raw
 * `?part=` value into what to render. An unknown part id (never in `parts`
 * at all) and a locked-but-real part id must both land on the same
 * "unavailable" outcome — neither should ever silently redirect or fall
 * back to a different, available part, which previously let a bad URL land
 * a learner on unrelated content (e.g. "Talk with Andrea") with no
 * indication anything was wrong.
 *
 * The one exception is a locked quiz: that renders the quiz gate's own
 * locked state (via `resolution.part`) rather than a bare error, so the
 * learner sees *why* it's locked instead of a dead end.
 */
export async function resolveAndPrepareLearnerPart({
  parts,
  requestedPart,
  signBlocks,
  attachEmbeds,
}: {
  parts: LearnerLessonPart[];
  requestedPart: string | null;
  signBlocks: (blocks: ContentBlock[]) => Promise<ContentBlock[]>;
  attachEmbeds: (blocks: ContentBlock[]) => Promise<ContentBlock[]>;
}): Promise<LearnerPartSelection> {
  const resolution = resolveLearnerPart(parts, requestedPart);
  const selected =
    resolution.requestedPartLocked && resolution.part?.kind === "quiz"
      ? resolution.part
      : await prepareLearnerPart({
          parts,
          // The raw requested id, never the pre-resolved fallback — passing
          // the fallback here is what let an unknown id quietly succeed.
          requestedPart,
          signBlocks,
          attachEmbeds,
        });
  return { resolution, selected };
}
