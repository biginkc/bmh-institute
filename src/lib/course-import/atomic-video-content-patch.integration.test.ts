import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { atomicImportOperations, buildRollbackOwnedIds } from "./execute";
import { buildImportPlan } from "./operations";
import { validCourseManifest } from "./test-fixtures";

const URL = process.env.TEST_SUPABASE_URL;
const SERVICE_ROLE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(URL && SERVICE_ROLE);
const service = URL && SERVICE_ROLE
  ? createClient(URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

describe.skipIf(!envPresent)("atomic imported video content patch", () => {
  it("patches an existing video and atomically rejects stale, mixed, and noncanonical batches", async () => {
    if (!service) throw new Error("Integration environment unavailable.");
    const suffix = randomBytes(8).toString("hex");
    const manifest = validCourseManifest();
    manifest.import_id = `video-patch-${suffix}-v1`;
    manifest.qa_role_group.name = `Video patch ${suffix}`;
    const plan = buildImportPlan(manifest);
    const video = plan.operations.find(
      (operation) => operation.table === "content_blocks" && operation.row.block_type === "video",
    );
    if (!video) throw new Error("Video fixture operation is missing.");

    const prefix = `courses/video-patch-${suffix}/v1`;
    const filePath = `${prefix}/videos/video.${"a".repeat(64)}.mp4`;
    const captionPath = `${prefix}/captions/video.${"b".repeat(64)}.vtt`;
    const storage = service.storage.from("content");
    let imported = false;
    try {
      const applied = await service.rpc("fn_apply_course_import", {
        p_import_id: plan.importId,
        p_operations: atomicImportOperations(plan),
      });
      if (applied.error) throw applied.error;
      imported = true;

      const uploadedVideo = await storage.upload(filePath, new Blob(["video"]), {
        contentType: "video/mp4",
        upsert: true,
      });
      if (uploadedVideo.error) throw uploadedVideo.error;
      const uploadedCaption = await storage.upload(captionPath, new Blob(["WEBVTT\n"]), {
        contentType: "text/vtt",
        upsert: true,
      });
      if (uploadedCaption.error) throw uploadedCaption.error;

      const before = await readContent(video.id);
      const replacement: Record<string, unknown> = {
        ...before,
        file_path: filePath,
        caption_path: captionPath,
      };
      delete replacement.transcript_path;

      const mixed = await service.rpc("fn_patch_imported_video_content", {
        p_import_id: plan.importId,
        p_patches: [
          { block_id: video.id, expected_content: before, replacement_content: replacement },
          {
            block_id: "00000000-0000-5000-a000-000000000001",
            expected_content: before,
            replacement_content: replacement,
          },
        ],
      });
      expect(mixed.error?.code).toBe("40001");
      expect(await readContent(video.id)).toEqual(before);

      const patched = await service.rpc("fn_patch_imported_video_content", {
        p_import_id: plan.importId,
        p_patches: [
          { block_id: video.id, expected_content: before, replacement_content: replacement },
        ],
      });
      expect(patched.error).toBeNull();
      expect(patched.data).toMatchObject({
        status: "patched",
        import_id: plan.importId,
        patch_count: 1,
      });
      expect(await readContent(video.id)).toEqual(replacement);

      const stale = await service.rpc("fn_patch_imported_video_content", {
        p_import_id: plan.importId,
        p_patches: [
          { block_id: video.id, expected_content: before, replacement_content: replacement },
        ],
      });
      expect(stale.error?.code).toBe("40001");
      expect(await readContent(video.id)).toEqual(replacement);

      const noncanonical = await service.rpc("fn_patch_imported_video_content", {
        p_import_id: plan.importId,
        p_patches: [{
          block_id: video.id,
          expected_content: replacement,
          replacement_content: {
            ...replacement,
            file_path: `courses/another-import/v1/videos/video.${"c".repeat(64)}.mp4`,
          },
        }],
      });
      expect(noncanonical.error?.code).toBe("22023");
      expect(await readContent(video.id)).toEqual(replacement);

      const missingObject = await service.rpc("fn_patch_imported_video_content", {
        p_import_id: plan.importId,
        p_patches: [{
          block_id: video.id,
          expected_content: replacement,
          replacement_content: {
            ...replacement,
            file_path: `${prefix}/videos/missing.${"d".repeat(64)}.mp4`,
          },
        }],
      });
      expect(missingObject.error?.code).toBe("22023");
      expect(await readContent(video.id)).toEqual(replacement);
    } finally {
      const cleanupErrors: unknown[] = [];
      const removed = await storage.remove([filePath, captionPath]);
      if (removed.error) cleanupErrors.push(removed.error);
      if (imported) {
        const rollback = await service.rpc("fn_rollback_course_import", {
          p_import_id: plan.importId,
          p_owned: buildRollbackOwnedIds(plan),
        });
        if (rollback.error) cleanupErrors.push(rollback.error);
      }
      if (cleanupErrors.length === 1) throw cleanupErrors[0];
      if (cleanupErrors.length > 1) {
        throw new AggregateError(cleanupErrors, "Integration fixture cleanup failed.");
      }
    }
  });
});

async function readContent(id: string): Promise<Record<string, unknown>> {
  if (!service) throw new Error("Integration environment unavailable.");
  const { data, error } = await service.from("content_blocks").select("content").eq("id", id).single();
  if (error || !data) throw error ?? new Error(`Video block ${id} is missing.`);
  return data.content as Record<string, unknown>;
}
