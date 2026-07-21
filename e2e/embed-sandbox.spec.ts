import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { bootstrapTestSession } from "./session-bootstrap";
import {
  cleanupWritePathFixture,
  createWritePathFixture,
  type WritePathFixture,
  writePathAdminClient,
} from "./write-path-fixtures";

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

test("rejects unsafe iframe_src, saves trimmed https, and renders sandbox", async ({
  page,
}) => {
  const admin = writePathAdminClient();
  let fixture: WritePathFixture | null = null;

  try {
    fixture = await createWritePathFixture(admin);
    await bootstrapTestSession(
      page,
      { email: fixture.admin.email, password: fixture.password },
      `/admin/lessons/${fixture.contentLessonId}/edit`,
    );

    const iframeInput = page.getByLabel(/iframe src/i);
    const embedEditor = iframeInput.locator(
      "xpath=ancestor::div[.//button[normalize-space()='Save block']][1]",
    );
    const saveEmbedBlock = embedEditor.getByRole("button", {
      name: /^save block$/i,
    });
    await iframeInput.fill("http://example.com");
    await saveEmbedBlock.click();
    await expect(
      page.getByText("Embed URL must start with https://"),
    ).toBeVisible();
    await expect
      .poll(() => readIframeSrc(admin, fixture!.contentBlockId))
      .toBe("https://www.loom.com/embed/original");

    await iframeInput.fill("  https://www.loom.com/embed/abc  ");
    await saveEmbedBlock.click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await expect
      .poll(() => readIframeSrc(admin, fixture!.contentBlockId))
      .toBe("https://www.loom.com/embed/abc");

    await page.goto(`/lessons/${fixture.contentLessonId}?part=lesson`);
    const iframe = page.locator('iframe[title="Embedded content"]');
    await expect(iframe).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-presentation",
    );
    await expect(iframe).toHaveAttribute("allow", /clipboard-write/);
  } finally {
    await cleanupWritePathFixture(admin, fixture);
  }
});
