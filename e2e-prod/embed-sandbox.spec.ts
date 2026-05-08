import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY;
const E2E_EMAIL = process.env.E2E_TEST_EMAIL;
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD;
const envPresent = Boolean(SUPABASE_URL && ANON_KEY && E2E_EMAIL && E2E_PASSWORD);

type Fixture = {
  courseId: string;
  lessonId: string;
  blockId: string;
};

async function adminClient(): Promise<SupabaseClient> {
  if (!SUPABASE_URL || !ANON_KEY || !E2E_EMAIL || !E2E_PASSWORD) {
    throw new Error(
      "embed sandbox prod smoke needs TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, E2E_TEST_EMAIL, and E2E_TEST_PASSWORD.",
    );
  }
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
  });
  if (error) throw error;
  return client;
}

async function createEmbedFixture(admin: SupabaseClient): Promise<Fixture> {
  const suffix = crypto.randomUUID();
  const { data: course, error: courseError } = await admin
    .from("courses")
    .insert({
      title: `E2E Embed Sandbox ${suffix}`,
      description: "Disposable Playwright fixture.",
      is_published: true,
    })
    .select("id")
    .single();
  if (courseError || !course) {
    throw courseError ?? new Error("Failed to create course fixture");
  }

  const { data: moduleRow, error: moduleError } = await admin
    .from("modules")
    .insert({
      course_id: course.id,
      title: "Embed sandbox module",
      sort_order: 0,
    })
    .select("id")
    .single();
  if (moduleError || !moduleRow) {
    throw moduleError ?? new Error("Failed to create module fixture");
  }

  const { data: lesson, error: lessonError } = await admin
    .from("lessons")
    .insert({
      module_id: moduleRow.id,
      title: "Embed sandbox lesson",
      lesson_type: "content",
      is_required_for_completion: true,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (lessonError || !lesson) {
    throw lessonError ?? new Error("Failed to create lesson fixture");
  }

  const { data: block, error: blockError } = await admin
    .from("content_blocks")
    .insert({
      lesson_id: lesson.id,
      block_type: "embed",
      content: {
        iframe_src: "https://www.loom.com/embed/original",
        aspect_ratio: "16:9",
      },
      sort_order: 0,
      is_required_for_completion: false,
    })
    .select("id")
    .single();
  if (blockError || !block) {
    throw blockError ?? new Error("Failed to create embed block fixture");
  }

  return { courseId: course.id as string, lessonId: lesson.id as string, blockId: block.id as string };
}

async function readIframeSrc(
  admin: SupabaseClient,
  blockId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("content_blocks")
    .select("content")
    .eq("id", blockId)
    .single();
  if (error || !data) throw error ?? new Error("Failed to read block fixture");
  const content = data.content as { iframe_src?: unknown };
  return typeof content.iframe_src === "string" ? content.iframe_src : "";
}

async function cleanupFixture(admin: SupabaseClient, fixture: Fixture | null) {
  if (!fixture) return;
  await admin.from("courses").delete().eq("id", fixture.courseId);
}

test.describe("embed iframe sandbox prod smoke", () => {
  test.skip(
    !envPresent,
    "TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, E2E_TEST_EMAIL, and E2E_TEST_PASSWORD are required.",
  );

  test("rejects unsafe iframe_src, saves trimmed https, and renders sandbox", async ({
    page,
  }) => {
    const admin = await adminClient();
    let fixture: Fixture | null = null;

    try {
      fixture = await createEmbedFixture(admin);

      await page.goto(`/admin/lessons/${fixture.lessonId}/edit`);
      await expect(
        page.getByRole("heading", { name: /edit lesson/i }),
      ).toBeVisible();

      const iframeInput = page.getByLabel(/iframe src/i);
      await iframeInput.fill("http://example.com");
      await page.getByRole("button", { name: /save block/i }).click();
      await expect(
        page.getByText("Embed URL must start with https://"),
      ).toBeVisible();
      await expect
        .poll(() => readIframeSrc(admin, fixture!.blockId))
        .toBe("https://www.loom.com/embed/original");

      await iframeInput.fill("  https://www.loom.com/embed/abc  ");
      await page.getByRole("button", { name: /save block/i }).click();
      await expect(page.getByText("Saved.")).toBeVisible();
      await expect
        .poll(() => readIframeSrc(admin, fixture!.blockId))
        .toBe("https://www.loom.com/embed/abc");

      await page.goto(`/lessons/${fixture.lessonId}`);
      const iframe = page.locator('iframe[title="Embedded content"]');
      await expect(iframe).toHaveAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-forms allow-presentation",
      );
      await expect(iframe).toHaveAttribute("allow", /clipboard-write/);
    } finally {
      await cleanupFixture(admin, fixture);
    }
  });
});
