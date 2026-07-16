import { beforeEach, describe, expect, it, vi } from "vitest";

const createSignedUrls = vi.fn();
const info = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: { from: vi.fn(() => ({ createSignedUrls, info })) },
  })),
}));

import { enrichBlocksWithSignedUrls, signAuthorizedArtworkPaths } from "./sign-urls";

describe("enrichBlocksWithSignedUrls", () => {
  beforeEach(() => {
    createSignedUrls.mockReset();
    info.mockReset();
  });

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

describe("signAuthorizedArtworkPaths", () => {
  beforeEach(() => {
    createSignedUrls.mockReset();
    info.mockReset();
  });

  it("signs only provenance-matched image objects with matching MIME", async () => {
    info.mockResolvedValue({ data: { metadata: { mimetype: "image/webp" } }, error: null });
    createSignedUrls.mockResolvedValue({
      data: [{ path: "courses/bmh/v1/thumbnails/cover.webp", signedUrl: "signed-cover" }],
      error: null,
    });

    const result = await signAuthorizedArtworkPaths([
      {
        entityType: "course",
        entityId: "11111111-1111-4111-8111-111111111111",
        contentImportId: "bmh-v1",
        path: "courses/bmh/v1/thumbnails/cover.webp",
      },
      {
        entityType: "course",
        entityId: "22222222-2222-4222-8222-222222222222",
        contentImportId: "other-v1",
        path: "courses/bmh/v1/thumbnails/forged.webp",
      },
    ]);

    expect(info).toHaveBeenCalledTimes(1);
    expect(result.get("courses/bmh/v1/thumbnails/cover.webp")).toBe("signed-cover");
  });

  it("fails closed when the stored MIME is not artwork", async () => {
    info.mockResolvedValue({ data: { metadata: { mimetype: "video/mp4" } }, error: null });
    const result = await signAuthorizedArtworkPaths([
      {
        entityType: "course",
        entityId: "11111111-1111-4111-8111-111111111111",
        contentImportId: "bmh-v1",
        path: "courses/bmh/v1/thumbnails/cover.webp",
      },
    ]);
    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});
