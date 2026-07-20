import { describe, expect, it } from "vitest";

import type { ContentBlock } from "@/components/content-blocks";
import {
  buildLearnerLessonParts,
  isGuideBlock,
  isObjectivesBlock,
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
      ["guide", false],
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
      ["guide", "Guide"],
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
