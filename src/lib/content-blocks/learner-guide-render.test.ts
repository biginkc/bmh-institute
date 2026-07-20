import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContentBlockRenderer, type ContentBlock } from "@/components/content-blocks";

import { buildLearnerLessonParts, selectLearnerPart } from "./learner-parts";
import { enrichBlocksWithSignedUrls } from "./sign-urls";

describe("pre-pass learner guide rendering", () => {
  it("puts neither guide copy nor a raw guide path into learner HTML", async () => {
    const blocks: ContentBlock[] = [
      {
        id: "video",
        block_type: "video",
        content: { source: "external", url: "https://example.test/video" },
        sort_order: 0,
        is_required_for_completion: true,
      },
      {
        id: "guide-text",
        block_type: "text",
        content: { html: "<h2>Learner guide</h2><p>Post-pass secret.</p>" },
        sort_order: 1,
        is_required_for_completion: false,
      },
      {
        id: "guide-file",
        block_type: "download",
        content: {
          file_path: "courses/training/v1/guides/learner-guide.pdf",
          filename: "learner-guide.pdf",
        },
        sort_order: 2,
        is_required_for_completion: false,
      },
    ];
    const authorized = await enrichBlocksWithSignedUrls(blocks, {
      includeGuides: false,
    });
    const parts = buildLearnerLessonParts({
      blocks: authorized,
      completedBlockIds: new Set(),
      quizComplete: false,
      quizUnlocked: false,
      compositeComplete: false,
    });
    const selected = selectLearnerPart(parts, "guide");
    const html = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        ...(selected?.blocks ?? []).map((block) =>
          React.createElement(ContentBlockRenderer, { key: block.id, block }),
        ),
      ),
    );

    expect(html).not.toContain("Post-pass secret");
    expect(html).not.toContain("learner-guide.pdf");
    expect(selected?.id).toBe("video-1");
  });
});
