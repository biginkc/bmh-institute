import { beforeEach, describe, expect, it, vi } from "vitest";

const createSignedUrls = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: { from: vi.fn(() => ({ createSignedUrls })) },
  })),
}));

import { enrichBlocksWithSignedUrls } from "./sign-urls";

describe("enrichBlocksWithSignedUrls", () => {
  beforeEach(() => createSignedUrls.mockReset());

  it("signs primary, poster, caption, and transcript paths in one batch", async () => {
    createSignedUrls.mockResolvedValue({
      data: [
        { path: "video.mp4", signedUrl: "signed-video" },
        { path: "poster.webp", signedUrl: "signed-poster" },
        { path: "captions.vtt", signedUrl: "signed-captions" },
        { path: "transcript.pdf", signedUrl: "signed-transcript" },
      ],
      error: null,
    });

    const [block] = await enrichBlocksWithSignedUrls([
      {
        id: "block",
        block_type: "video",
        sort_order: 0,
        is_required_for_completion: true,
        content: {
          file_path: "video.mp4",
          poster_path: "poster.webp",
          caption_path: "captions.vtt",
          transcript_path: "transcript.pdf",
        },
      },
    ]);

    expect(createSignedUrls).toHaveBeenCalledWith(
      ["video.mp4", "poster.webp", "captions.vtt", "transcript.pdf"],
      3600,
    );
    expect(block.content).toMatchObject({
      signed_url: "signed-video",
      poster_signed_url: "signed-poster",
      caption_signed_url: "signed-captions",
      transcript_signed_url: "signed-transcript",
    });
  });

  it("never exposes a signed URL for a path the storage signer did not return", async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: "authorized.mp4", signedUrl: "signed-authorized" }],
      error: null,
    });

    const [block] = await enrichBlocksWithSignedUrls([
      {
        id: "block",
        block_type: "video",
        sort_order: 0,
        is_required_for_completion: true,
        content: {
          file_path: "authorized.mp4",
          transcript_path: "cross-course.pdf",
        },
      },
    ]);

    expect(block.content.signed_url).toBe("signed-authorized");
    expect(block.content).not.toHaveProperty("transcript_signed_url");
  });
});
