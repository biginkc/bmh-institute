import { expect, test, type Page } from "@playwright/test";

import {
  cleanupWritePathFixture,
  createWritePathFixture,
  writePathAdminClient,
  type WritePathFixture,
} from "./write-path-fixtures";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function hasRoleGroup(fixture: WritePathFixture): Promise<boolean> {
  const admin = writePathAdminClient();
  const { data, error } = await admin
    .from("user_role_groups")
    .select("role_group_id")
    .eq("user_id", fixture.unassigned.id)
    .eq("role_group_id", fixture.roleGroupId);
  if (error) return false;
  return (data ?? []).length === 1;
}

test.describe("pilot cohort setup", () => {
  test.describe.configure({ timeout: 90_000 });

  test("reviews and corrects missing pilot access", async ({ page }) => {
    const admin = writePathAdminClient();
    let fixture: WritePathFixture | null = null;

    try {
      fixture = await createWritePathFixture(admin);

      await signIn(page, fixture.admin.email, fixture.password);
      await page.goto("/admin/users");

      await expect(page.getByRole("heading", { name: "Learner access" })).toBeVisible();
      const learnerAccess = page
        .getByTestId("learner-access-table-scroll")
        .getByRole("table");
      const readyRow = learnerAccess
        .getByRole("row")
        .filter({ hasText: fixture.learner.email });
      await expect(readyRow).toContainText("Ready");
      await expect(readyRow).toContainText("Role group assigned");

      const missingRow = learnerAccess
        .getByRole("row")
        .filter({ hasText: fixture.unassigned.email });
      await expect(missingRow).toContainText("Needs access");
      await expect(missingRow).toContainText("No role group assigned");
      await missingRow.getByRole("link", { name: /review access/i }).click();
      await expect(
        page.locator("[data-user-edit-form][data-hydrated='true']"),
      ).toBeVisible();

      const pilotRoleGroup = page.getByLabel(`${fixture.prefix} Role Group`);
      await pilotRoleGroup.check();
      await expect(pilotRoleGroup).toBeChecked();
      await page.getByRole("button", { name: /^save changes$/i }).click();

      await expect
        .poll(() => hasRoleGroup(fixture!), { timeout: 20_000 })
        .toBe(true);

      await page.goto("/admin/users");
      await expect(
        learnerAccess.getByRole("row").filter({ hasText: fixture.unassigned.email }),
      ).toContainText("Ready");
    } finally {
      await cleanupWritePathFixture(admin, fixture);
    }
  });
});
