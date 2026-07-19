import { test, expect } from "@playwright/test";

test.describe("ecosystem shell navigation", () => {
  test("admin shell exposes shared topbar and left navigation", async ({
    page,
  }) => {
    await page.goto("/admin/submissions");

    await expect(
      page.getByRole("link", { name: "BMH Institute dashboard" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /submissions/i }).first(),
    ).toHaveAttribute("data-active", "true");
    await expect(
      page.getByRole("button", { name: /sign out/i }),
    ).toBeVisible();
  });

  test("mobile shell keeps primary navigation reachable", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/dashboard");

    const header = page.locator("header");
    const logo = header.getByRole("link", { name: "BMH Institute dashboard" });
    const search = header.getByRole("button", { name: "Search lessons" });
    const navigation = header.getByRole("button", { name: "Open primary navigation" });
    const profile = header.getByRole("link", { name: /profile$/i });
    for (const control of [logo, search, navigation, profile]) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      if (!box) throw new Error("A visible mobile header control had no bounding box");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
    expect(await header.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
      await header.evaluate((element) => element.clientWidth),
    );

    await search.click();
    await expect(page.getByRole("combobox", { name: "Search lessons" })).toBeVisible();
    await navigation.click();
    await expect(page.getByRole("combobox", { name: "Search lessons" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /dashboard/i }).first(),
    ).toHaveAttribute("data-active", "true");

    await page.getByRole("link", { name: "Certificates" }).click();
    await expect(page).toHaveURL(/\/certificates$/);
    await expect(page.getByRole("heading", { name: "Certificates" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();
    await expect(page.getByRole("combobox", { name: "Search lessons" })).toBeHidden();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  });

  test("mobile navigation closes when the viewport crosses the desktop breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Open primary navigation" }).click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

    await page.setViewportSize({ width: 1024, height: 768 });

    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  });
});
