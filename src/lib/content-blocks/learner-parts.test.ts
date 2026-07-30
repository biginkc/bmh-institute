import { describe, expect, it } from "vitest";

import type { ContentBlock } from "@/components/content-blocks";
import {
  buildLearnerLessonParts,
  isGuideBlock,
  isObjectivesBlock,
  resolveLearnerPart,
  selectLearnerPart,
} from "./learner-parts";

function block(
  id: string,
  blockType: ContentBlock["block_type"],
  content: Record<string, unknown> = {},
): ContentBlock {
  return {
    id,
    block_type: blockType,
    content,
    sort_order: Number(id.replace(/\D/g, "")) || 0,
    is_required_for_completion: blockType === "video" || blockType === "role_play",
  };
}

describe("learner lesson parts", () => {
  it("orders multiple videos before role play, quiz, then the post-pass guide", () => {
    const result = buildLearnerLessonParts({
      blocks: [
        block("1", "text", { html: "<h2>What you will learn</h2><p>Duplicate.</p>" }),
        block("2", "video", { title: "Video one" }),
        block("3", "video", { title: "Video two" }),
        block("4", "text", { html: "<h2>Learner guide</h2><p>Reference.</p>" }),
        block("5", "download", {
          file_path: "courses/training/v1/guides/slot-01-learner-guide.pdf",
          filename: "slot-01-learner-guide.pdf",
        }),
        block("6", "flashcard", { cards: [{ front: "A", back: "B" }] }),
        block("7", "role_play", { title: "Practice" }),
      ],
      completedBlockIds: new Set(["2", "3", "7"]),
      quizComplete: true,
      quizUnlocked: true,
      compositeComplete: true,
    });

    expect(result.map((part) => [part.id, part.label])).toEqual([
      ["video-1", "Video A"],
      ["video-2", "Video B"],
      ["role-play-1", "Role play"],
      ["quiz", "Quiz"],
      ["guide", "Guide"],
    ]);
    expect(result.flatMap((part) => part.blocks.map((item) => item.id))).not.toContain("1");
    expect(result.flatMap((part) => part.blocks.map((item) => item.id))).not.toContain("6");
  });

  it("locks each next part until the prior required part is complete", () => {
    const parts = buildLearnerLessonParts({
      blocks: [block("1", "video"), block("2", "role_play")],
      completedBlockIds: new Set(),
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: false,
    });

    expect(parts.map((part) => [part.id, part.available])).toEqual([
      ["video-1", true],
      ["role-play-1", false],
      ["quiz", false],
    ]);
    expect(selectLearnerPart(parts, "quiz")?.id).toBe("video-1");
    expect(selectLearnerPart(parts, "made-up")?.id).toBe("video-1");
  });

  it("preserves multiple role-play blocks as separate ordered parts", () => {
    const parts = buildLearnerLessonParts({
      blocks: [
        block("1", "video"),
        block("2", "role_play", { scenario_id: "pending:first" }),
        block("3", "role_play", { scenario_id: "pending:second" }),
      ],
      completedBlockIds: new Set(["1"]),
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: false,
    });
    expect(parts.map((part) => [part.id, part.label])).toEqual([
      ["video-1", "Video"],
      ["role-play-1", "Role play A"],
      ["role-play-2", "Role play B"],
      ["quiz", "Quiz"],
    ]);
  });

  it("labels an oral-check role-play block Talk with Andrea", () => {
    const parts = buildLearnerLessonParts({
      blocks: [
        block("1", "video"),
        block("2", "role_play", { mode: "oral_check", scenario_id: "pending:oral-check-1" }),
      ],
      completedBlockIds: new Set(["1"]),
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: false,
    });
    expect(parts.map((part) => [part.id, part.label, part.kind])).toEqual([
      ["video-1", "Video", "video"],
      ["role-play-1", "Talk with Andrea", "role_play"],
      ["quiz", "Quiz", "quiz"],
    ]);
  });

  it("letters oral-check parts separately from plain role-play parts if a lesson ever mixes both", () => {
    const parts = buildLearnerLessonParts({
      blocks: [
        block("1", "role_play", { scenario_id: "pending:role-play-first" }),
        block("2", "role_play", { mode: "oral_check", scenario_id: "pending:oral-check-first" }),
        block("3", "role_play", { scenario_id: "pending:role-play-second" }),
      ],
      completedBlockIds: new Set(),
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: false,
    });
    expect(parts.map((part) => [part.id, part.label])).toEqual([
      ["role-play-1", "Role play A"],
      ["role-play-2", "Talk with Andrea"],
      ["role-play-3", "Role play B"],
      ["quiz", "Quiz"],
    ]);
  });

  it("assigns every supported non-guide block to a visible part", () => {
    const supported = [
      block("1", "text", { html: "<p>Support text</p>" }),
      block("2", "callout"),
      block("3", "image"),
      block("4", "audio"),
      block("5", "external_link"),
      block("6", "embed"),
      block("7", "divider"),
    ];
    const parts = buildLearnerLessonParts({
      blocks: supported,
      completedBlockIds: new Set(),
      quizComplete: false,
      quizUnlocked: true,
      compositeComplete: false,
    });

    expect(parts[0]).toMatchObject({ id: "lesson", label: "Lesson" });
    expect(parts[0].blocks.map((item) => item.id)).toEqual(
      supported.map((item) => item.id),
    );
  });

  it("omits the quiz part for a hand-authored lesson with no quiz", () => {
    const parts = buildLearnerLessonParts({
      blocks: [block("1", "video")],
      completedBlockIds: new Set(["1"]),
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: true,
      includeQuiz: false,
    });

    expect(parts.map((part) => part.id)).toEqual(["video-1"]);
  });

  it("keeps a real guide as the final part for a no-quiz lesson", () => {
    const parts = buildLearnerLessonParts({
      blocks: [
        block("1", "video"),
        block("2", "download", { filename: "learner-guide.pdf" }),
      ],
      completedBlockIds: new Set(["1"]),
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: true,
      includeQuiz: false,
    });

    expect(parts.map((part) => part.id)).toEqual(["video-1", "guide"]);
  });

  it("uses deterministic guide and duplicate-objective heuristics", () => {
    expect(
      isGuideBlock(block("1", "text", { html: "<h2>Learner guide</h2>" })),
    ).toBe(true);
    expect(
      isGuideBlock(
        block("2", "pdf", { file_path: "courses/x/v1/guides/reference.pdf" }),
      ),
    ).toBe(true);
    expect(
      isGuideBlock(block("3", "download", { filename: "learner-guide.pdf" })),
    ).toBe(true);
    expect(
      isObjectivesBlock(block("4", "text", { html: "<h2>What you will learn</h2>" })),
    ).toBe(true);
    expect(
      isGuideBlock(block("5", "text", { html: "<p>Use this guide carefully.</p>" })),
    ).toBe(false);
    expect(
      isGuideBlock(block("6", "download", { filename: "manager-guide.pdf" })),
    ).toBe(false);
  });
});

describe("optional (not-required) parts", () => {
  it("does not render a never-attempted optional role play as complete", () => {
    // Reproduces the 2026-07-27 finding: after making the six live role-play
    // blocks temporarily non-required (to unlock the course without gating
    // on the still-broken embed handshake), every role play rendered a
    // "Complete" badge and rail checkmark before any learner had ever
    // attempted it — because `complete` and "counts toward unlocking later
    // parts" were the same flag. They must not be.
    const parts = buildLearnerLessonParts({
      blocks: [
        { ...block("1", "video"), is_required_for_completion: true },
        { ...block("2", "role_play"), is_required_for_completion: false },
      ],
      completedBlockIds: new Set(["1"]), // role play NEVER attempted
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: false,
    });

    const rolePlay = parts.find((part) => part.id === "role-play-1");
    expect(rolePlay?.complete).toBe(false);
  });

  it("still unlocks later parts past an optional, unattempted role play", () => {
    const parts = buildLearnerLessonParts({
      blocks: [
        { ...block("1", "video"), is_required_for_completion: true },
        { ...block("2", "role_play"), is_required_for_completion: false },
      ],
      completedBlockIds: new Set(["1"]),
      quizComplete: false,
      quizUnlocked: true,
      compositeComplete: false,
    });

    expect(parts.find((part) => part.id === "quiz")?.available).toBe(true);
  });

  it("renders complete once the optional role play is actually attempted", () => {
    const parts = buildLearnerLessonParts({
      blocks: [
        { ...block("1", "video"), is_required_for_completion: true },
        { ...block("2", "role_play"), is_required_for_completion: false },
      ],
      completedBlockIds: new Set(["1", "2"]),
      quizComplete: false,
      quizUnlocked: true,
      compositeComplete: false,
    });

    expect(parts.find((part) => part.id === "role-play-1")?.complete).toBe(true);
  });

  it("preserves a valid locked quiz request so the page can render an explicit lock", () => {
    const parts = buildLearnerLessonParts({
      blocks: [block("1", "video")],
      completedBlockIds: new Set<string>(),
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: false,
    });
    expect(resolveLearnerPart(parts, "quiz")).toMatchObject({
      requestedPart: "quiz",
      requestedPartValid: true,
      requestedPartLocked: true,
      part: { id: "quiz", available: false },
    });
  });

  it("canonicalizes an invalid part to the first safe available part", () => {
    const parts = buildLearnerLessonParts({
      blocks: [block("1", "video")],
      completedBlockIds: new Set<string>(),
      quizComplete: false,
      quizUnlocked: true,
      compositeComplete: false,
    });
    expect(resolveLearnerPart(parts, "bogus")).toMatchObject({
      requestedPart: "bogus",
      requestedPartValid: false,
      requestedPartLocked: false,
      part: { id: "video-1" },
      canonicalPartId: "video-1",
    });
  });

  it("lands on the optional role play by default, not past it", () => {
    // No requested part (a fresh lesson-page visit): selectLearnerPart should
    // pick the first available-but-not-genuinely-done part. Before this fix
    // the role play read as "complete" purely for being optional, so a
    // learner opening the lesson would be dropped straight on the quiz,
    // skipping the practice with no indication it existed.
    const parts = buildLearnerLessonParts({
      blocks: [
        { ...block("1", "video"), is_required_for_completion: true },
        { ...block("2", "role_play"), is_required_for_completion: false },
      ],
      completedBlockIds: new Set(["1"]),
      quizComplete: false,
      quizUnlocked: true,
      compositeComplete: false,
    });

    expect(selectLearnerPart(parts, null)?.id).toBe("role-play-1");
    // A direct, explicit link to the (unlocked) quiz is still honored — this
    // guard only blocks FORGED requests to locked parts, never a deliberate
    // jump past an optional one.
    expect(selectLearnerPart(parts, "quiz")?.id).toBe("quiz");
  });
});
