import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  cleanupProductionPilotDryRunFixture,
  countProductionPilotDryRunArtifacts,
  createProductionPilotDryRunFixture,
  productionAdminClient,
  productionUserClient,
  type ProductionPilotDryRunFixture,
} from "./production-fixtures";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

test.describe("production pilot dry run", () => {
  test("rehearses a disposable pilot cohort against production data paths", async ({
    browser,
  }) => {
    const admin = productionAdminClient();
    let fixture: ProductionPilotDryRunFixture | null = null;
    const manifest: Record<string, unknown> = {
      startedAt: new Date().toISOString(),
      baseURL: process.env.E2E_PROD_BASE_URL,
      steps: [],
    };

    try {
      fixture = await createProductionPilotDryRunFixture(admin);
      manifest.prefix = fixture.prefix;
      manifest.fixture = {
        programId: fixture.programId,
        courseId: fixture.courseId,
        roleGroupId: fixture.roleGroupId,
        users: {
          admin: fixture.admin.email,
          certified: fixture.certified.email,
          needsReview: fixture.needsReview.email,
          needsRevision: fixture.needsRevision.email,
          notStarted: fixture.notStarted.email,
          needsAccess: fixture.needsAccess.email,
          accessCorrection: fixture.accessCorrection.email,
          suspended: fixture.suspended.email,
        },
      };
      recordStep(manifest, "created disposable production cohort");

      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();
      await signIn(adminPage, fixture.admin.email, fixture.password);
      recordStep(manifest, "signed in disposable production owner");

      await adminPage.goto("/admin/reports");
      await expect(
        adminPage.getByRole("heading", { name: "Pilot monitoring" }),
      ).toBeVisible();
      await expectPilotRow(adminPage, fixture.needsAccess.email, "Needs access");
      await expectPilotRow(adminPage, fixture.accessCorrection.email, "Needs access");
      await expectPilotRow(adminPage, fixture.suspended.email, "Needs access");
      await expectPilotRow(adminPage, fixture.needsRevision.email, "Needs revision");
      await expectPilotRow(adminPage, fixture.needsReview.email, "Needs review");
      await expectPilotRow(adminPage, fixture.notStarted.email, "Not started");
      recordStep(manifest, "verified pilot monitoring action states");

      const csv = await downloadPilotCsv(adminPage);
      expect(csv).toContain(fixture.certified.email);
      expect(csv).toContain(`${fixture.certified.email},Certified`);
      expect(csv).toContain(`${fixture.needsReview.email},Needs review`);
      expect(csv).toContain(`${fixture.needsRevision.email},Needs revision`);
      expect(csv).toContain(`${fixture.notStarted.email},Not started`);
      expect(csv).toContain(`${fixture.needsAccess.email},Needs access`);
      expect(csv).toContain(`${fixture.accessCorrection.email},Needs access`);
      expect(csv).toContain(`${fixture.suspended.email},Needs access`);
      recordStep(manifest, "verified pilot CSV export");

      await adminPage.goto(`/admin/users/${fixture.accessCorrection.id}/edit`);
      await expect(adminPage.getByLabel(`${fixture.prefix} Pilot Cohort`)).toBeVisible();
      await adminPage.getByLabel(`${fixture.prefix} Pilot Cohort`).check();
      await adminPage.getByRole("button", { name: /^save changes$/i }).click();
      await expect(adminPage.getByText(/saved/i)).toBeVisible();

      await adminPage.goto("/admin/reports");
      await expectPilotRow(adminPage, fixture.accessCorrection.email, "Not started");
      recordStep(manifest, "verified admin can correct learner access");

      const needsAccessPage = await (await browser.newContext()).newPage();
      await signIn(needsAccessPage, fixture.needsAccess.email, fixture.password);
      await expect(needsAccessPage.getByText(/no training assigned yet/i)).toBeVisible();
      await needsAccessPage.goto(`/courses/${fixture.courseId}`);
      await expect(needsAccessPage.getByText(`${fixture.prefix} Pilot Course`)).toHaveCount(0);

      const needsAccessClient = await productionUserClient(
        fixture.needsAccess.email,
        fixture.password,
      );
      const { data: blockedCourseRows, error: blockedCourseError } =
        await needsAccessClient
          .from("courses")
          .select("id")
          .eq("id", fixture.courseId);
      expect(blockedCourseError).toBeNull();
      expect(blockedCourseRows ?? []).toHaveLength(0);
      recordStep(manifest, "verified unassigned learner is blocked by UI and RLS");

      await adminContext.close();
      await needsAccessPage.context().close();
    } finally {
      await cleanupProductionPilotDryRunFixture(admin, fixture);
      if (fixture) {
        const counts = await countProductionPilotDryRunArtifacts(
          admin,
          fixture.prefix,
        );
        manifest.cleanupCounts = counts;
        expect(Object.values(counts).every((value) => value === 0)).toBe(true);
      }
      manifest.finishedAt = new Date().toISOString();
      writeManifest(manifest);
    }
  });
});

async function expectPilotRow(page: Page, email: string, status: string) {
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(row).toContainText(status);
}

async function downloadPilotCsv(page: Page): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /^export csv$/i }).click(),
  ]);
  const filepath = await download.path();
  if (!filepath) throw new Error("Pilot CSV download path was not available.");
  return fs.readFileSync(filepath, "utf8");
}

function recordStep(manifest: Record<string, unknown>, label: string) {
  const steps = manifest.steps as string[];
  steps.push(`${new Date().toISOString()} ${label}`);
}

function writeManifest(manifest: Record<string, unknown>) {
  const outputDir = path.resolve(process.cwd(), "test-results");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "production-pilot-dryrun-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}
