import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(dashboard)/lessons/[lessonId]/actions", () => ({
  completeRolePlayBlock: vi.fn(),
  loadVideoProgress: vi.fn(async () => ({
    ok: true,
    positionSeconds: 0,
    watchedRanges: [],
    watchedPercent: 0,
    completed: false,
  })),
  recordVideoProgress: vi.fn(),
  recordVideoSeek: vi.fn(),
}));

import { ContentBlockRenderer, type ContentBlock } from "./content-blocks";

function renderBlock(
  blockType: ContentBlock["block_type"],
  content: Record<string, unknown>,
) {
  return render(
    <ContentBlockRenderer
      block={{
        id: `block-${blockType}`,
        block_type: blockType,
        content,
        sort_order: 0,
        is_required_for_completion: false,
      }}
    />,
  );
}

describe("ContentBlockRenderer BMH treatments", () => {
  it.each([
    ["video", { source: "upload", signed_url: "https://example.com/video.mp4" }],
    ["text", { html: "<h2>Opening standard</h2><p>Start here.</p>" }],
    ["pdf", { signed_url: "https://example.com/guide.pdf", filename: "Guide" }],
    ["image", { signed_url: "https://example.com/framework.png", alt: "Call framework" }],
    ["audio", { source: "url", url: "https://example.com/coach.mp3" }],
    ["download", { signed_url: "https://example.com/script.pdf", filename: "Script.pdf" }],
    ["external_link", { url: "https://example.com/practice", label: "Practice room" }],
    ["embed", { iframe_src: "https://example.com/embed", aspect_ratio: "16:9" }],
    [
      "role_play",
      {
        iframe_src: "https://practice.example.com/embed/role-play/scenario-1",
        scenario_id: "scenario-1",
        title: "Agent opening role play",
      },
    ],
    ["divider", {}],
    ["callout", { variant: "info", markdown: "Lead with certainty." }],
    ["flashcard", { cards: [{ front: "BMH", back: "Better Made Homes" }] }],
  ] as const)("renders the %s block inside its branded surface", (blockType, content) => {
    const { container } = renderBlock(blockType, content);

    expect(container.querySelector(`[data-content-block="${blockType}"]`)).not.toBeNull();
  });

  it("renders flashcards through the native accessible player", () => {
    renderBlock("flashcard", {
      cards: [{ front: "BMH", back: "Better Made Homes" }],
    });

    expect(screen.getByText("BMH")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reveal answer" })).toBeVisible();
  });

  it("passes signed video support assets to the learner player", () => {
    const { container } = renderBlock("video", {
      source: "upload",
      signed_url: "https://example.com/video.mp4",
      poster_signed_url: "https://example.com/poster.webp",
      caption_signed_url: "https://example.com/captions.vtt",
      transcript_signed_url: "https://example.com/transcript.pdf",
    });

    expect(screen.getByLabelText("Lesson video")).toHaveAttribute(
      "poster",
      "https://example.com/poster.webp",
    );
    expect(container.querySelector('track[kind="captions"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open video transcript" })).toBeVisible();
  });

  it("renders authored video titles and part labels with distinct accessible names", () => {
    renderBlock("video", {
      source: "upload",
      signed_url: "https://example.com/video.mp4",
      title: "The five-part opening",
      part_label: "Part B",
    });

    expect(screen.getByText("Part B")).toBeVisible();
    expect(screen.getByRole("heading", { name: "The five-part opening" })).toBeVisible();
    expect(screen.getByLabelText("Part B: The five-part opening")).toBeVisible();
  });

  it("passes persisted completion into role play blocks", () => {
    render(
      <ContentBlockRenderer
        completed
        block={{
          id: "role-play-1",
          block_type: "role_play",
          content: {
            iframe_src: "https://practice.example.com/embed/role-play/scenario-1",
            scenario_id: "scenario-1",
            title: "Opening practice",
          },
          sort_order: 0,
          is_required_for_completion: true,
        }}
      />,
    );

    expect(screen.getByText("Complete")).toBeVisible();
  });

  it("passes persisted completion into uploaded video blocks", () => {
    render(
      <ContentBlockRenderer
        completed
        block={{
          id: "video-1",
          block_type: "video",
          content: {
            source: "upload",
            signed_url: "https://example.com/video.mp4",
            title: "Opening the call",
          },
          sort_order: 0,
          is_required_for_completion: true,
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Complete");
  });

  it("keeps authored text HTML intact at the trusted rendering boundary", () => {
    renderBlock("text", {
      html: "<h2>Opening standard</h2><p>Lead with <strong>certainty</strong>.</p>",
    });

    expect(screen.getByRole("heading", { name: "Opening standard" })).toBeVisible();
    expect(screen.getByText("certainty")).toBeVisible();
  });

  it("sanitizes stored text again at the learner rendering boundary", () => {
    const { container } = renderBlock("text", {
      html: '<p onclick="alert(1)">Visible</p><script>bad()</script><a href="javascript:bad()">Unsafe link</a>',
    });

    expect(screen.getByText("Visible")).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect(screen.getByText("Unsafe link")).not.toHaveAttribute(
      "href",
      expect.stringContaining("javascript:"),
    );
  });

  it("preserves locked embed sandbox and media permissions", () => {
    renderBlock("embed", {
      iframe_src: "https://www.loom.com/embed/abc",
      aspect_ratio: "16:9",
    });

    const iframe = screen.getByTitle("Embedded content");
    expect(iframe).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-presentation",
    );
    expect(iframe.getAttribute("allow")).toContain("clipboard-write");
  });

  it("renders clear semantics for every resource block", () => {
    const pdf = renderBlock("pdf", {
      signed_url: "https://example.com/guide.pdf",
      filename: "Opening guide",
    });
    expect(screen.getByTitle("Opening guide")).toBeVisible();
    pdf.unmount();

    const image = renderBlock("image", {
      signed_url: "https://example.com/framework.png",
      alt: "Call framework",
      caption: "The opening framework",
    });
    expect(screen.getByRole("img", { name: "Call framework" })).toBeVisible();
    expect(screen.getByText("The opening framework")).toBeVisible();
    image.unmount();

    const audio = renderBlock("audio", {
      source: "url",
      url: "https://example.com/coach.mp3",
    });
    expect(screen.getByLabelText("Lesson audio")).toBeVisible();
    audio.unmount();

    const download = renderBlock("download", {
      signed_url: "https://example.com/script.pdf",
      filename: "Script.pdf",
    });
    expect(screen.getByRole("link", { name: /download script.pdf/i })).toBeVisible();
    download.unmount();

    renderBlock("external_link", {
      url: "https://example.com/practice",
      label: "Practice room",
    });
    expect(screen.getByRole("link", { name: /practice room/i })).toBeVisible();
  });

  it("renders safe placeholders when media has no source", () => {
    renderBlock("embed", { iframe_src: "https://" });

    expect(screen.queryByTitle("Embedded content")).not.toBeInTheDocument();
    expect(screen.getByText("Embed URL not set.")).toBeVisible();
  });
});
