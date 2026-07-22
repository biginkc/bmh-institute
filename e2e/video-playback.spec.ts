import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { bootstrapTestSession } from "./session-bootstrap";
import { SIGNED_PLAYBACK_VIDEO_BASE64 } from "./video-playback-fixture";
import { writePathAdminClient } from "./write-path-fixtures";

type PlaybackFixture = {
  courseId: string;
  lessonId: string;
  roleGroupId: string;
  storagePath: string;
  learner: { id: string; email: string; password: string };
};

test.describe("signed learner video playback", () => {
  test.describe.configure({ timeout: 90_000 });

  test("keeps one signed media source playing across multiple progress saves", async ({
    page,
  }) => {
    const admin = writePathAdminClient();
    let fixture: PlaybackFixture | null = null;

    try {
      fixture = await createPlaybackFixture(admin);
      await bootstrapTestSession(
        page,
        { email: fixture.learner.email, password: fixture.learner.password },
        `/lessons/${fixture.lessonId}`,
      );

      const video = page.getByLabel("Playback continuity video");
      await expect(video).toBeVisible();
      await expect
        .poll(
          () =>
            video.evaluate(
              (element) => (element as HTMLVideoElement).readyState,
            ),
          {
            message: "signed media should become playable",
          },
        )
        .toBeGreaterThanOrEqual(3);

      const initialSource = await video.evaluate(
        (element) => (element as HTMLVideoElement).currentSrc,
      );
      expect(initialSource).toContain("/storage/v1/object/sign/content/");
      expect(new URL(initialSource).searchParams.has("token")).toBe(true);

      await installPlaybackDisruptionRecorder(page);
      await page.getByRole("button", { name: "Play lesson video" }).click();

      const checkpoints: number[] = [];
      for (const target of [2.5, 4.5, 6.5]) {
        await expect
          .poll(
            () =>
              video.evaluate(
                (element) => (element as HTMLVideoElement).currentTime,
              ),
            {
              timeout: 12_000,
              message: `video should advance through ${target} seconds`,
            },
          )
          .toBeGreaterThanOrEqual(target);
        const state = await video.evaluate((element) => {
          const media = element as HTMLVideoElement;
          return {
            currentTime: media.currentTime,
            paused: media.paused,
            source: media.currentSrc,
          };
        });
        checkpoints.push(state.currentTime);
        expect(state.paused).toBe(false);
        expect(state.source).toBe(initialSource);
      }

      expect(checkpoints[1]).toBeGreaterThan(checkpoints[0]);
      expect(checkpoints[2]).toBeGreaterThan(checkpoints[1]);
      await expect(page.getByRole("status")).not.toHaveText("0% watched");
      await expect.poll(() => readPlaybackDisruptions(page)).toEqual([]);
    } finally {
      await cleanupPlaybackFixture(admin, fixture);
    }
  });
});

async function createPlaybackFixture(
  admin: SupabaseClient,
): Promise<PlaybackFixture> {
  const prefix = `E2E-VIDEO-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const password = `BMHVideo-${crypto.randomUUID()}!1`;
  const email = `${prefix.toLowerCase()}@bmh-institute.test`;
  const storagePath = `e2e/${prefix}/playback.webm`;
  const media = Buffer.from(SIGNED_PLAYBACK_VIDEO_BASE64, "base64");
  const { error: uploadError } = await admin.storage
    .from("content")
    .upload(storagePath, media, { contentType: "video/webm", upsert: false });
  if (uploadError) throw uploadError;

  const { data: created, error: createUserError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${prefix} Learner` },
    });
  if (createUserError || !created.user) {
    throw createUserError ?? new Error("Failed to create video learner");
  }
  await admin
    .from("profiles")
    .update({
      full_name: `${prefix} Learner`,
      system_role: "learner",
      status: "active",
    })
    .eq("id", created.user.id)
    .throwOnError();

  const roleGroupId = await insertOne(admin, "role_groups", {
    name: `${prefix} Role Group`,
    description: "Disposable signed-video browser regression role group.",
  });
  await admin
    .from("user_role_groups")
    .insert({ user_id: created.user.id, role_group_id: roleGroupId })
    .throwOnError();
  const courseId = await insertOne(admin, "courses", {
    title: `${prefix} Course`,
    description: "Disposable signed-video browser regression course.",
    is_published: true,
    certificate_enabled: false,
    sort_order: 9999,
  });
  await admin
    .from("course_access")
    .insert({ course_id: courseId, role_group_id: roleGroupId })
    .throwOnError();
  const moduleId = await insertOne(admin, "modules", {
    course_id: courseId,
    title: `${prefix} Module`,
    description: "Disposable playback module.",
    sort_order: 10,
  });
  const lessonId = await insertOne(admin, "lessons", {
    module_id: moduleId,
    title: `${prefix} Playback Lesson`,
    description: "Disposable playback lesson.",
    lesson_type: "content",
    is_required_for_completion: false,
    sort_order: 10,
  });
  await insertOne(admin, "content_blocks", {
    lesson_id: lessonId,
    block_type: "video",
    content: {
      source: "upload",
      title: "Playback continuity video",
      file_path: storagePath,
      filename: "playback.webm",
      mime_type: "video/webm",
      duration_seconds: 10,
    },
    sort_order: 10,
    is_required_for_completion: true,
  });

  return {
    courseId,
    lessonId,
    roleGroupId,
    storagePath,
    learner: { id: created.user.id, email, password },
  };
}

async function cleanupPlaybackFixture(
  admin: SupabaseClient,
  fixture: PlaybackFixture | null,
): Promise<void> {
  if (!fixture) return;
  await admin.from("courses").delete().eq("id", fixture.courseId);
  await admin.from("role_groups").delete().eq("id", fixture.roleGroupId);
  await admin.auth.admin.deleteUser(fixture.learner.id);
  await admin.storage.from("content").remove([fixture.storagePath]);
}

async function insertOne(
  admin: SupabaseClient,
  table: string,
  values: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin
    .from(table)
    .insert(values)
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw error ?? new Error(`Failed to insert ${table}`);
  return data.id;
}

async function installPlaybackDisruptionRecorder(page: Page): Promise<void> {
  await page.getByLabel("Playback continuity video").evaluate((element) => {
    const state = window as typeof window & {
      __bmhPlaybackDisruptions?: string[];
    };
    state.__bmhPlaybackDisruptions = [];
    for (const eventName of ["emptied", "loadstart"]) {
      element.addEventListener(eventName, () => {
        state.__bmhPlaybackDisruptions?.push(eventName);
      });
    }
  });
}

async function readPlaybackDisruptions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const state = window as typeof window & {
      __bmhPlaybackDisruptions?: string[];
    };
    return state.__bmhPlaybackDisruptions ?? [];
  });
}
