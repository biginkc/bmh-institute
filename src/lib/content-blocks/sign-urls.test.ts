import { beforeEach, describe, expect, it, vi } from "vitest";

const createSignedUrls = vi.fn();
const info = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: { from: vi.fn(() => ({ createSignedUrls, info })) },
  })),
}));

import { enrichBlocksWithSignedUrls, signAuthorizedArtworkPaths } from "./sign-urls";
import { artworkRequestKey } from "@/lib/artwork/paths";

const SHA = "a".repeat(64);
const APPROVED_PATH = `courses/bmh/v1/thumbnails/cover-${SHA}.webp`;
const imported = {
  thumbnailAssetKey: "thumbnail-course",
  thumbnailApprovedPath: APPROVED_PATH,
  thumbnailApprovedSha256: SHA,
};

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

  it("withholds guide text and guide files before composite completion", async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: "video.mp4", signedUrl: "signed-video" }],
      error: null,
    });

    const blocks = await enrichBlocksWithSignedUrls(
      [
        {
          id: "video",
          block_type: "video",
          sort_order: 1,
          is_required_for_completion: true,
          content: { file_path: "video.mp4" },
        },
        {
          id: "guide-text",
          block_type: "text",
          sort_order: 2,
          is_required_for_completion: false,
          content: { html: "<h2>Learner guide</h2><p>Private until pass.</p>" },
        },
        {
          id: "guide-file",
          block_type: "download",
          sort_order: 3,
          is_required_for_completion: false,
          content: {
            file_path: "courses/training/v1/guides/learner-guide.pdf",
            filename: "learner-guide.pdf",
          },
        },
        {
          id: "guide-pdf",
          block_type: "pdf",
          sort_order: 4,
          is_required_for_completion: false,
          content: { file_path: "courses/training/v1/guides/reference.pdf" },
        },
      ],
      { includeGuides: false },
    );

    expect(blocks.map((block) => block.id)).toEqual(["video"]);
    expect(JSON.stringify(blocks)).not.toContain("learner-guide.pdf");
    expect(createSignedUrls).toHaveBeenCalledWith(["video.mp4"], 3600);
  });

  it("signs and returns guide files after composite completion", async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: "courses/training/v1/guides/learner-guide.pdf", signedUrl: "signed-guide" }],
      error: null,
    });
    const blocks = await enrichBlocksWithSignedUrls([
      {
        id: "guide-file",
        block_type: "download",
        sort_order: 1,
        is_required_for_completion: false,
        content: {
          file_path: "courses/training/v1/guides/learner-guide.pdf",
          filename: "learner-guide.pdf",
        },
      },
    ], { includeGuides: true });

    expect(blocks[0].content.signed_url).toBe("signed-guide");
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
      data: [{ path: APPROVED_PATH, signedUrl: "signed-cover" }],
      error: null,
    });

    const result = await signAuthorizedArtworkPaths([
      {
        entityType: "course",
        entityId: "11111111-1111-4111-8111-111111111111",
        contentImportId: "bmh-v1",
        ...imported,
        path: APPROVED_PATH,
      },
      {
        entityType: "course",
        entityId: "22222222-2222-4222-8222-222222222222",
        contentImportId: "other-v1",
        ...imported,
        path: "courses/bmh/v1/thumbnails/forged.webp",
      },
    ]);

    expect(info).toHaveBeenCalledTimes(1);
    expect(result.get(artworkRequestKey("course", "11111111-1111-4111-8111-111111111111"))).toBe("signed-cover");
  });

  it("fails closed when the stored MIME is not artwork", async () => {
    info.mockResolvedValue({ data: { metadata: { mimetype: "video/mp4" } }, error: null });
    const result = await signAuthorizedArtworkPaths([
      {
        entityType: "course",
        entityId: "11111111-1111-4111-8111-111111111111",
        contentImportId: "bmh-v1",
        ...imported,
        path: APPROVED_PATH,
      },
    ]);
    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it("does not launder one authorized path onto a different entity request", async () => {
    info.mockResolvedValue({ data: { metadata: { mimetype: "image/webp" } }, error: null });
    createSignedUrls.mockResolvedValue({
      data: [{ path: APPROVED_PATH, signedUrl: "signed-cover" }],
      error: null,
    });
    const result = await signAuthorizedArtworkPaths([
      {
        entityType: "course",
        entityId: "11111111-1111-4111-8111-111111111111",
        contentImportId: "bmh-v1",
        ...imported,
        path: APPROVED_PATH,
      },
      {
        entityType: "course",
        entityId: "22222222-2222-4222-8222-222222222222",
        contentImportId: "other-v1",
        ...imported,
        path: APPROVED_PATH,
      },
    ]);
    expect(result.get(artworkRequestKey("course", "11111111-1111-4111-8111-111111111111"))).toBe("signed-cover");
    expect(result.has(artworkRequestKey("course", "22222222-2222-4222-8222-222222222222"))).toBe(false);
  });

  it("checks artwork metadata concurrently with a safe upper bound", async () => {
    let active = 0;
    let maxActive = 0;
    info.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { data: { metadata: { mimetype: "image/webp" } }, error: null };
    });
    createSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })),
      error: null,
    }));
    const requests = Array.from({ length: 14 }, (_, index) => {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      return {
        entityType: "course" as const,
        entityId: id,
        contentImportId: null,
        thumbnailAssetKey: null,
        thumbnailApprovedPath: null,
        thumbnailApprovedSha256: null,
        path: `catalog/courses/${id}/thumbnails/cover.webp`,
      };
    });

    const result = await signAuthorizedArtworkPaths(requests);

    expect(result.size).toBe(14);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(6);
  });
});
