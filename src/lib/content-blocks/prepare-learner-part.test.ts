import { describe, expect, it, vi } from "vitest";

import type { LearnerLessonPart } from "./learner-parts";
import { prepareLearnerPart } from "./prepare-learner-part";

const videoA = block("video-a", "video");
const videoB = block("video-b", "video");
const rolePlay = block("role-play-hidden", "role_play");

const parts: LearnerLessonPart[] = [
  { id: "video-1", label: "Video A", kind: "video", blocks: [videoA], complete: true, available: true },
  { id: "video-2", label: "Video B", kind: "video", blocks: [videoB], complete: false, available: true },
  { id: "role-play-1", label: "Role play", kind: "role_play", blocks: [rolePlay], complete: false, available: false },
  { id: "quiz", label: "Quiz", kind: "quiz", blocks: [], complete: false, available: true },
];

describe("prepareLearnerPart", () => {
  it("signs and embeds only blocks belonging to the selected part", async () => {
    const signBlocks = vi.fn(async (blocks) => blocks);
    const attachEmbeds = vi.fn(async (blocks) => blocks);
    const selected = await prepareLearnerPart({
      parts,
      requestedPart: "video-2",
      signBlocks,
      attachEmbeds,
    });
    expect(selected?.id).toBe("video-2");
    expect(signBlocks).toHaveBeenCalledWith([videoB]);
    expect(attachEmbeds).toHaveBeenCalledWith([videoB]);
    expect(signBlocks).not.toHaveBeenCalledWith(expect.arrayContaining([videoA, rolePlay]));
  });

  it("does not invoke media or token preparation for a quiz", async () => {
    const signBlocks = vi.fn(async (blocks) => blocks);
    const attachEmbeds = vi.fn(async (blocks) => blocks);
    const selected = await prepareLearnerPart({
      parts,
      requestedPart: "quiz",
      signBlocks,
      attachEmbeds,
    });
    expect(selected?.kind).toBe("quiz");
    expect(signBlocks).not.toHaveBeenCalled();
    expect(attachEmbeds).not.toHaveBeenCalled();
  });
});

function block(id: string, blockType: "video" | "role_play") {
  return {
    id,
    block_type: blockType,
    content: {},
    sort_order: 1,
    is_required_for_completion: true,
  } as const;
}
