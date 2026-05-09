import { test, expect } from "@playwright/test";

test.describe("ecosystem shell navigation", () => {
  test("admin shell exposes shared topbar and left navigation", async ({
    page,
  }) => {
    await page.goto("/admin/submissions");

    await expect(
      page.getByRole("link", { name: /bmh institute training platform/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /submissions/i }).first(),
    ).toHaveAttribute("data-active", "true");
    await expect(
      page.getByRole("link", { name: /submissions/i }).first(),
    ).toHaveClass(/border-l-4/);
    await expect(
      page.getByRole("button", { name: /sign out/i }),
    ).toBeVisible();
  });

  test("mobile shell keeps primary navigation reachable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");

    await expect(
      page.getByRole("link", { name: /bmh institute training platform/i }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /dashboard/i }).first(),
    ).toHaveAttribute("data-active", "true");
  });
});
