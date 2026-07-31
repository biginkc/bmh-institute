import { describe, expect, it } from "vitest";

import type { ContentBlock } from "@/components/content-blocks";
import {
  buildLearnerLessonParts,
  isGuideBlock,
  isObjectivesBlock,
  resolveLearnerPart,
  selectLearnerPart,
  shouldRenderLearnerPartLock,
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

  it("does not lock a fallback part when a locked non-quiz request falls back", () => {
    const parts = buildLearnerLessonParts({
      blocks: [
        block("1", "video"),
        block("2", "text", { html: "<h2>Learner Guide</h2>" }),
      ],
      completedBlockIds: new Set(["1"]),
      quizComplete: false,
      quizUnlocked: true,
      compositeComplete: false,
    });
    const resolution = resolveLearnerPart(parts, "guide");

    expect(resolution).toMatchObject({
      requestedPart: "guide",
      requestedPartLocked: true,
      part: { id: "guide" },
    });
    expect(shouldRenderLearnerPartLock({
      requestedPartLocked: resolution.requestedPartLocked,
      requestedPartId: resolution.requestedPart,
      selectedPartId: "quiz",
    })).toBe(false);
    expect(shouldRenderLearnerPartLock({
      requestedPartLocked: resolution.requestedPartLocked,
      requestedPartId: resolution.requestedPart,
      selectedPartId: "guide",
    })).toBe(true);
  });

  it("reports the fallback part for an invalid id, but the caller must not silently render it", () => {
    // `resolveLearnerPart` is a pure computation: it always reports what the
    // fallback/canonical part *would* be, even for a bogus id. That's still
    // correct here — this is only the low-level resolver's contract.
    //
    // It is NOT license to redirect or render that fallback for an unknown
    // `?part=` value. The real page (`resolveAndPrepareLearnerPart` in
    // prepare-learner-part.ts) deliberately ignores `part`/`canonicalPartId`
    // for an invalid request and renders the same "unavailable" outcome as a
    // locked part instead — see prepare-learner-part.test.ts. A prior version
    // of this test's name implied the app canonicalizes/redirects bad part
    // ids; it no longer does, and never should again.
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

describe("revisiting a completed part after an upstream gate regresses", () => {
  // Reproduces the 2026-07-30 production finding (lesson
  // 90ceaa26-0992-5991-a1c6-07070e3f7200): Video A's completion was
  // invalidated by a content-update migration, which regressed the
  // `priorComplete` chain for every later part. Video B and "Talk with
  // Andrea" were still genuinely complete (green checks in the rail) but
  // rendered as an unclickable, disabled span because their `available` flag
  // rode along with the regressed chain instead of their own completion.
  it("keeps a completed part clickable even though an earlier part's gate regressed", () => {
    const parts = buildLearnerLessonParts({
      blocks: [
        block("1", "video"), // Video A — invalidated, no longer "done"
        block("2", "video"), // Video B — still genuinely complete
        block("3", "role_play", { mode: "oral_check" }), // Talk with Andrea — still complete
      ],
      // Video A dropped out of completedBlockIds (its asset changed); Video B
      // and the oral check were never re-invalidated and stay complete.
      completedBlockIds: new Set(["2", "3"]),
      invalidatedBlockIds: new Set(["1"]),
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: false,
    });

    const videoA = parts.find((part) => part.id === "video-1");
    const videoB = parts.find((part) => part.id === "video-2");
    const oralCheck = parts.find((part) => part.id === "role-play-1");

    expect(videoA).toMatchObject({ complete: false, available: true, invalidated: true });
    // The real bug: these two must stay `available` (clickable) even though
    // Video A — the upstream gate — is no longer done.
    expect(videoB).toMatchObject({ complete: true, available: true, invalidated: false });
    expect(oralCheck).toMatchObject({ complete: true, available: true, invalidated: false });
  });

  it("still locks a genuinely un-started part behind an incomplete upstream gate", () => {
    // The progression rule itself must not be weakened: a part the learner
    // has never actually completed stays locked behind an incomplete,
    // required prior part — regressed or not.
    const parts = buildLearnerLessonParts({
      blocks: [
        block("1", "video"), // Video A — invalidated
        block("2", "video"), // Video B — never started
      ],
      completedBlockIds: new Set<string>(),
      invalidatedBlockIds: new Set(["1"]),
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: false,
    });

    const videoB = parts.find((part) => part.id === "video-2");
    expect(videoB).toMatchObject({
      complete: false,
      available: false,
      invalidated: false,
    });
  });

  it("marks only a video invalidated by an asset swap, not a video that was simply never started", () => {
    const parts = buildLearnerLessonParts({
      blocks: [block("1", "video"), block("2", "video")],
      completedBlockIds: new Set<string>(),
      // Only block "1" has a stale user_block_progress row; block "2" has no
      // progress row at all — an ordinary not-yet-started video.
      invalidatedBlockIds: new Set(["1"]),
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: false,
    });

    expect(parts.find((part) => part.id === "video-1")?.invalidated).toBe(true);
    expect(parts.find((part) => part.id === "video-2")?.invalidated).toBe(false);
  });

  it("never marks a role-play or oral-check part invalidated (asset invalidation is video-only)", () => {
    const parts = buildLearnerLessonParts({
      blocks: [block("1", "role_play", { mode: "oral_check" })],
      completedBlockIds: new Set<string>(),
      // A caller that (incorrectly) included a non-video block id here must
      // still never mark it invalidated — only videos carry asset_version.
      invalidatedBlockIds: new Set(["1"]),
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: false,
    });

    expect(parts.find((part) => part.id === "role-play-1")?.invalidated).toBe(false);
  });
});
