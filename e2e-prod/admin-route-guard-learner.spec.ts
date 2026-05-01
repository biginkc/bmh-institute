// HARDEN-01 + TPAR-03: regression that an unauthenticated session is
// redirected to /login when navigating directly to any /admin/reports/*
// route. Pinned to the prod-config harness because the contract is "guard
// fires before any data fetch" — a clean session is the strictest test of
// that contract. Phase 01.1 Path A: this spec uses test.use to opt OUT of
// the chromium project's default admin storage state.
import { test, expect } from "@playwright/test";

test.describe("HARDEN-01 admin route guard from a non-admin viewpoint", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated session is redirected away from /admin/reports", async ({ page }) => {
    await page.goto("/admin/reports");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated session is redirected away from /admin/reports/users/[id]", async ({ page }) => {
    await page.goto("/admin/reports/users/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated session is redirected away from /admin/reports/courses/[id]", async ({ page }) => {
    await page.goto("/admin/reports/courses/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated session is redirected away from /admin/reports/programs/[id]", async ({ page }) => {
    await page.goto("/admin/reports/programs/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });
});
