import { describe, expect, it, vi } from "vitest";

import type { LearnerLessonPart } from "./learner-parts";
import {
  prepareLearnerPart,
  resolveAndPrepareLearnerPart,
} from "./prepare-learner-part";

const videoA = block("video-a", "video");
const videoB = block("video-b", "video");
const rolePlay = block("role-play-hidden", "role_play");

const parts: LearnerLessonPart[] = [
  { id: "video-1", label: "Video A", kind: "video", blocks: [videoA], complete: true, available: true, invalidated: false },
  { id: "video-2", label: "Video B", kind: "video", blocks: [videoB], complete: false, available: true, invalidated: false },
  { id: "role-play-1", label: "Role play", kind: "role_play", blocks: [rolePlay], complete: false, available: false, invalidated: false },
  { id: "quiz", label: "Quiz", kind: "quiz", blocks: [], complete: false, available: true, invalidated: false },
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

  it.each(["not-a-real-part", "role-play-1"])(
    "rejects an explicit unknown or unavailable part request: %s",
    async (requestedPart) => {
      const signBlocks = vi.fn(async (blocks) => blocks);
      const attachEmbeds = vi.fn(async (blocks) => blocks);
      const selected = await prepareLearnerPart({
        parts,
        requestedPart,
        signBlocks,
        attachEmbeds,
      });

      expect(selected).toBeNull();
      expect(signBlocks).not.toHaveBeenCalled();
      expect(attachEmbeds).not.toHaveBeenCalled();
    },
  );

  it("keeps the normal default selection when no part is requested", async () => {
    const signBlocks = vi.fn(async (blocks) => blocks);
    const attachEmbeds = vi.fn(async (blocks) => blocks);
    const selected = await prepareLearnerPart({
      parts,
      requestedPart: null,
      signBlocks,
      attachEmbeds,
    });

    expect(selected?.id).toBe("video-2");
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

// This is the exact composition the lesson page (`ContentCompositeLesson` in
// `page.tsx`) delegates to for every `?part=` request. Exercising it here —
// rather than only `prepareLearnerPart` in isolation with a hand-picked raw
// string — is what actually proves the real page can't be reached with an
// unknown or locked part id: the page never calls `prepareLearnerPart`
// directly, it calls this.
describe("resolveAndPrepareLearnerPart (real page decision path)", () => {
  const partsWithLockedGuide: LearnerLessonPart[] = [
    { id: "video-1", label: "Video A", kind: "video", blocks: [videoA], complete: false, available: true, invalidated: false },
    { id: "guide", label: "Guide", kind: "guide", blocks: [], complete: false, available: false, invalidated: false },
  ];
  const partsWithLockedQuiz: LearnerLessonPart[] = [
    { id: "video-1", label: "Video A", kind: "video", blocks: [videoA], complete: false, available: true, invalidated: false },
    { id: "quiz", label: "Quiz", kind: "quiz", blocks: [], complete: false, available: false, invalidated: false },
  ];

  function harness() {
    return {
      signBlocks: vi.fn(async (blocks) => blocks),
      attachEmbeds: vi.fn(async (blocks) => blocks),
    };
  }

  it("renders the same unavailable outcome for a genuinely unknown part id as for a locked one (regression: bad ?part= URL landing on unrelated content)", async () => {
    const unknown = harness();
    const unknownResult = await resolveAndPrepareLearnerPart({
      parts: partsWithLockedGuide,
      requestedPart: "not-a-real-part",
      ...unknown,
    });
    expect(unknownResult.selected).toBeNull();
    expect(unknownResult.resolution.requestedPartValid).toBe(false);
    expect(unknown.signBlocks).not.toHaveBeenCalled();
    expect(unknown.attachEmbeds).not.toHaveBeenCalled();

    const locked = harness();
    const lockedResult = await resolveAndPrepareLearnerPart({
      parts: partsWithLockedGuide,
      requestedPart: "guide",
      ...locked,
    });
    expect(lockedResult.selected).toBeNull();
    expect(lockedResult.resolution.requestedPartValid).toBe(true);
    expect(lockedResult.resolution.requestedPartLocked).toBe(true);
    expect(locked.signBlocks).not.toHaveBeenCalled();
    expect(locked.attachEmbeds).not.toHaveBeenCalled();

    // Both requests must produce the identical learner-facing outcome: null.
    expect(unknownResult.selected).toEqual(lockedResult.selected);
  });

  it("never redirects an unknown part id to a different, available part", async () => {
    const { selected, resolution } = await resolveAndPrepareLearnerPart({
      parts: partsWithLockedGuide,
      requestedPart: "not-a-real-part",
      ...harness(),
    });
    // The bug: this used to resolve to "video-1" (the canonical fallback)
    // and successfully prepare it, silently landing the learner there.
    expect(selected).toBeNull();
    expect(resolution.canonicalPartId).not.toBeNull();
    expect(selected?.id).not.toBe(resolution.canonicalPartId);
  });

  it("still renders the quiz gate's locked state (not a bare error) for a locked quiz request", async () => {
    const { selected, resolution } = await resolveAndPrepareLearnerPart({
      parts: partsWithLockedQuiz,
      requestedPart: "quiz",
      ...harness(),
    });
    expect(selected?.id).toBe("quiz");
    expect(resolution.requestedPartLocked).toBe(true);
  });

  it("keeps normal default selection when no part is requested", async () => {
    const { selected } = await resolveAndPrepareLearnerPart({
      parts,
      requestedPart: null,
      ...harness(),
    });
    expect(selected?.id).toBe("video-2");
  });
});
