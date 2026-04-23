import { test, expect } from "@playwright/test";

test.describe("admin surfaces", () => {
  test("overview shows stat cards", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();
    await expect(page.getByText(/^Programs$/)).toBeVisible();
    await expect(page.getByText(/^Courses$/)).toBeVisible();
  });

  test("programs list renders", async ({ page }) => {
    await page.goto("/admin/programs");
    await expect(page.getByRole("heading", { name: /programs/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /new program/i }),
    ).toBeVisible();
  });

  test("courses list renders", async ({ page }) => {
    await page.goto("/admin/courses");
    await expect(page.getByRole("heading", { name: /^courses$/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /new course/i }),
    ).toBeVisible();
  });

  test("users page shows invite form", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: /^users$/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /invite someone/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send invite/i }),
    ).toBeVisible();
  });

  test("role groups page lists the seeded groups", async ({ page }) => {
    await page.goto("/admin/role-groups");
    await expect(
      page.getByRole("heading", { name: /role groups/i }),
    ).toBeVisible();
    // Seeded group from migration 005 — rendered as an editable <input value=...>
    await expect(
      page.locator('input[value="Appointment Setters"]'),
    ).toBeVisible();
  });
});
