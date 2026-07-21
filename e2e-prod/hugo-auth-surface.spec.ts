import { expect, test } from "@playwright/test";

test.describe("Hugo-only production auth surface", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("exposes exactly one Hugo action and no app credential fields", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: /^continue with hugo$/i }),
    ).toHaveCount(1);
    await expect(page.getByLabel(/email/i)).toHaveCount(0);
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /forgot|reset|set password/i }),
    ).toHaveCount(0);
  });

  test("dead-ends legacy recovery and invite-acceptance routes", async ({
    context,
    page,
  }) => {
    for (const legacyPath of ["/forgot-password", "/auth/set-password"]) {
      await page.goto(legacyPath);
      await expect(page).toHaveURL(/\/login$/);
      await expect(
        page.getByRole("button", { name: /^continue with hugo$/i }),
      ).toHaveCount(1);
      await expect(page.getByLabel(/email|password/i)).toHaveCount(0);
    }

    const removedResetRoute = await page.goto("/reset-password");
    expect(removedResetRoute?.status()).toBe(404);
    await expect(page.getByLabel(/email|password/i)).toHaveCount(0);

    const inviteResponse = await context.request.post("/auth/apply-invite");
    expect(inviteResponse.status()).toBe(410);
    await expect(inviteResponse.json()).resolves.toEqual({
      ok: false,
      error: "legacy_invites_disabled",
    });
  });
});
