import { expect, test, type Page } from "@playwright/test";
import {
  cleanupProductionInviteFixture,
  cleanupProductionRecoveryFixture,
  cleanupProductionReadinessFixture,
  createProductionInviteFixture,
  createProductionRecoveryFixture,
  createProductionReadinessFixture,
  productionAdminClient,
  productionUserClient,
  type ProductionInviteFixture,
  type ProductionRecoveryFixture,
  type ProductionReadinessFixture,
} from "./production-fixtures";
import {
  buildTaggedEmailAddress,
  emailCaptureConfigFromEnv,
  waitForEmailLink,
} from "./email-capture";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

test.describe("production readiness lifecycle", () => {
  test("validates real production auth, DB writes, storage, review, certificates, and cleanup", async ({
    browser,
  }) => {
    const admin = productionAdminClient();
    let fixture: ProductionReadinessFixture | null = null;

    try {
      fixture = await createProductionReadinessFixture(admin);

      const learnerContext = await browser.newContext();
      const learner = await learnerContext.newPage();
      await signIn(learner, fixture.learner.email, fixture.password);

      await expect(
        learner.getByText(`${fixture.prefix} Program`),
      ).toBeVisible();
      await learner.goto(`/courses/${fixture.courseId}`);
      await expect(
        learner.getByRole("heading", { name: `${fixture.prefix} Course` }),
      ).toBeVisible();

      await learner.getByRole("link", { name: new RegExp(`${fixture.prefix} Content Lesson`) }).click();
      await expect(
        learner.getByRole("heading", { name: `${fixture.prefix} Content Lesson` }),
      ).toBeVisible();
      await learner.getByRole("button", { name: /mark lesson complete/i }).click();
      await expect(learner.getByText(/lesson complete/i)).toBeVisible();

      await learner.goto(`/lessons/${fixture.quizLessonId}`);
      await learner.getByText(fixture.correctOptionText).click();
      await learner.getByRole("button", { name: /submit quiz/i }).click();
      await expect(learner.getByText(/^Passed$/)).toBeVisible();

      await learner.goto(`/lessons/${fixture.textAssignmentLessonId}`);
      await learner.getByLabel(/response/i).fill(`${fixture.prefix} first response`);
      await learner.getByRole("button", { name: /^submit$/i }).click();
      await expect(
        learner.getByText(/submitted, awaiting review/i),
      ).toBeVisible();

      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();
      await signIn(adminPage, fixture.admin.email, fixture.password);

      await adminPage.goto(`/admin/lessons/${fixture.contentLessonId}/edit`);
      const unsafeHtml = [
        `<p style="color:red">${fixture.prefix} sanitized text</p>`,
        '<script>window.__bmhUnsafe = true</script>',
        '<a href="javascript:alert(1)">unsafe link</a>',
      ].join("");
      await adminPage.getByLabel(/^html$/i).fill(unsafeHtml);
      await adminPage.getByRole("button", { name: /^save block$/i }).first().click();
      await expect(adminPage.getByText(/^saved\.$/i)).toBeVisible();

      await adminPage.getByLabel(/iframe src/i).fill("http://example.com");
      await adminPage.getByRole("button", { name: /^save block$/i }).nth(1).click();
      await expect(
        adminPage.getByText(/embed url must start with https:\/\//i),
      ).toBeVisible();
      await adminPage.getByLabel(/iframe src/i).fill("https://example.com");
      await adminPage.getByRole("button", { name: /^save block$/i }).nth(1).click();
      await expect(adminPage.getByText(/^saved\.$/i)).toBeVisible();

      const [sanitizedText, embedContent] = await Promise.all([
        getBlockContent(admin, fixture.contentBlockId),
        getBlockContent(admin, fixture.embedBlockId),
      ]);
      expect(String(sanitizedText.html)).toContain(`${fixture.prefix} sanitized text`);
      expect(String(sanitizedText.html)).not.toContain("<script");
      expect(String(sanitizedText.html)).not.toContain("javascript:");
      expect(String(sanitizedText.html)).not.toContain("style=");
      expect(embedContent.iframe_src).toBe("https://example.com");

      await learner.goto(`/lessons/${fixture.contentLessonId}`);
      await expect(
        learner.getByText(`${fixture.prefix} sanitized text`),
      ).toBeVisible();
      const renderedEmbed = learner.getByTitle("Embedded content");
      await expect(renderedEmbed).toBeVisible();
      await expect(renderedEmbed).toHaveAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-forms allow-presentation",
      );

      await adminPage.goto("/admin/submissions");
      const textSubmissionCard = adminPage
        .locator('[data-slot="card"]')
        .filter({ hasText: `${fixture.prefix} Text Assignment` })
        .first();
      await expect(textSubmissionCard).toBeVisible();
      await textSubmissionCard
        .getByPlaceholder(/note to learner/i)
        .fill(`${fixture.prefix} revise this response`);
      await textSubmissionCard
        .getByRole("button", { name: /request revision/i })
        .click();
      await expect(adminPage.getByText(/sent back with note/i)).toBeVisible();

      await learner.goto(`/lessons/${fixture.textAssignmentLessonId}`);
      await expect(
        learner.locator("div", { hasText: /^Needs revision$/ }).first(),
      ).toBeVisible();
      await learner.getByLabel(/response/i).fill(`${fixture.prefix} revised response`);
      await learner.getByRole("button", { name: /^submit$/i }).click();
      await expect(
        learner.getByText(/submitted, awaiting review/i),
      ).toBeVisible();

      await adminPage.goto("/admin/submissions");
      const revisedTextSubmissionCard = adminPage
        .locator('[data-slot="card"]')
        .filter({ hasText: `${fixture.prefix} Text Assignment` })
        .first();
      await expect(revisedTextSubmissionCard).toBeVisible();
      await revisedTextSubmissionCard
        .getByRole("button", { name: /^approve$/i })
        .click();
      await expect(adminPage.getByText(/approved/i)).toBeVisible();

      await learner.goto(`/lessons/${fixture.fileAssignmentLessonId}`);
      await learner
        .locator('input[type="file"]')
        .setInputFiles({
          name: "production-readiness-upload.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(`${fixture.prefix} production readiness upload`),
        });
      await expect(
        learner.getByText(/selected: production-readiness-upload.txt/i),
      ).toBeVisible();
      await learner.getByRole("button", { name: /^submit$/i }).click();
      await expect(
        learner.getByText(/submitted, awaiting review/i),
      ).toBeVisible();

      const uploadedPath = await findUploadedSubmissionPath(admin, fixture);
      expect(uploadedPath).toMatch(new RegExp(`^${fixture.learner.id}/`));
      const signed = await admin.storage
        .from("submissions")
        .createSignedUrl(uploadedPath, 60);
      expect(signed.error).toBeNull();
      expect(signed.data?.signedUrl).toContain("/storage/v1/object/sign/submissions/");

      const learnerClient = await productionUserClient(
        fixture.learner.email,
        fixture.password,
      );
      const unassignedClient = await productionUserClient(
        fixture.unassigned.email,
        fixture.password,
      );
      await expectAccessibleRows(learnerClient, "courses", fixture.courseId, 1);
      await expectAccessibleRows(learnerClient, "lessons", fixture.contentLessonId, 1);
      await expectAccessibleRows(unassignedClient, "courses", fixture.courseId, 0);
      await expectAccessibleRows(unassignedClient, "lessons", fixture.contentLessonId, 0);
      await expectAccessibleRows(
        unassignedClient,
        "assignment_submissions",
        fixture.fileAssignmentLessonId,
        0,
        "lesson_id",
      );

      const learnerDownload = await learnerClient.storage
        .from("submissions")
        .download(uploadedPath);
      expect(learnerDownload.error).toBeNull();
      await expect(learnerDownload.data?.text()).resolves.toContain(
        `${fixture.prefix} production readiness upload`,
      );

      const unassignedDownload = await unassignedClient.storage
        .from("submissions")
        .download(uploadedPath);
      expect(unassignedDownload.data).toBeNull();
      expect(unassignedDownload.error).not.toBeNull();

      const blockedCrossPrefixPath = `${fixture.learner.id}/blocked-cross-prefix.txt`;
      const crossPrefixUpload = await unassignedClient.storage
        .from("submissions")
        .upload(blockedCrossPrefixPath, Buffer.from("blocked"), {
          contentType: "text/plain",
          upsert: false,
        });
      expect(crossPrefixUpload.data).toBeNull();
      expect(crossPrefixUpload.error).not.toBeNull();
      await admin.storage.from("submissions").remove([blockedCrossPrefixPath]);

      await adminPage.goto("/admin/submissions");
      const fileSubmissionCard = adminPage
        .locator('[data-slot="card"]')
        .filter({ hasText: `${fixture.prefix} File Assignment` })
        .first();
      await expect(fileSubmissionCard).toBeVisible();
      await fileSubmissionCard
        .getByRole("button", { name: /^approve$/i })
        .click();
      await expect(adminPage.getByText(/approved/i)).toBeVisible();

      await expect
        .poll(() => hasCourseAndProgramCertificates(admin, fixture!), {
          timeout: 20_000,
        })
        .toBe(true);

      await learner.goto("/certificates");
      await expect(learner.getByText(`${fixture.prefix} Course`)).toBeVisible();
      await expect(learner.getByText(`${fixture.prefix} Program`)).toBeVisible();
      await learner.getByRole("link", { name: /view & print/i }).first().click();
      await expect(learner).toHaveURL(/\/certificates\/(course|program)\//);
      await expect(
        learner.getByRole("button", { name: /print \/ save pdf/i }),
      ).toBeVisible();

      const unassignedContext = await browser.newContext();
      const unassigned = await unassignedContext.newPage();
      await signIn(unassigned, fixture.unassigned.email, fixture.password);
      await expect(unassigned.getByText(/no training assigned yet/i)).toBeVisible();
      await unassigned.goto("/admin");
      await expect(unassigned).not.toHaveURL(/\/admin$/);
      await unassigned.goto(`/courses/${fixture.courseId}`);
      await expect(unassigned.getByText(`${fixture.prefix} Course`)).toHaveCount(0);

      await learnerContext.close();
      await adminContext.close();
      await unassignedContext.close();
    } finally {
      await cleanupProductionReadinessFixture(admin, fixture);
    }
  });
});

async function findUploadedSubmissionPath(
  admin: ReturnType<typeof productionAdminClient>,
  fixture: ProductionReadinessFixture,
): Promise<string> {
  const { data, error } = await admin
    .from("assignment_submissions")
    .select("submission_file_path")
    .eq("lesson_id", fixture.fileAssignmentLessonId)
    .eq("user_id", fixture.learner.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.submission_file_path) {
    throw error ?? new Error("File submission path was not recorded.");
  }
  return data.submission_file_path as string;
}

async function getBlockContent(
  admin: ReturnType<typeof productionAdminClient>,
  blockId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from("content_blocks")
    .select("content")
    .eq("id", blockId)
    .maybeSingle();
  if (error || !data?.content) {
    throw error ?? new Error(`Content block ${blockId} was not found.`);
  }
  return data.content as Record<string, unknown>;
}

async function expectAccessibleRows(
  client: ReturnType<typeof productionAdminClient>,
  table: string,
  id: string,
  expectedCount: number,
  column = "id",
) {
  const { data, error } = await client
    .from(table)
    .select("id")
    .eq(column, id);
  expect(error).toBeNull();
  expect(data ?? []).toHaveLength(expectedCount);
}

async function hasCourseAndProgramCertificates(
  admin: ReturnType<typeof productionAdminClient>,
  fixture: ProductionReadinessFixture,
): Promise<boolean> {
  const [course, program] = await Promise.all([
    admin
      .from("certificates")
      .select("id")
      .eq("user_id", fixture.learner.id)
      .eq("course_id", fixture.courseId)
      .maybeSingle(),
    admin
      .from("program_certificates")
      .select("id")
      .eq("user_id", fixture.learner.id)
      .eq("program_id", fixture.programId)
      .maybeSingle(),
  ]);
  if (course.error || program.error) return false;
  return Boolean(course.data?.id && program.data?.id);
}

test.describe("production readiness email links", () => {
  test("accepts a real production invite link sent through the admin UI", async ({
    browser,
  }) => {
    const emailConfig = emailCaptureConfigFromEnv();
    test.skip(
      !emailConfig,
      "PROD_READINESS_EMAIL_INBOX and PROD_READINESS_EMAIL_IMAP_PASS are required for real invite-link retrieval.",
    );

    const admin = productionAdminClient();
    const inviteeEmail = buildTaggedEmailAddress(
      emailConfig!.inbox,
      `prd-invite-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    );
    let fixture: ProductionInviteFixture | null = null;
    const sentAfter = new Date(Date.now() - 15_000);
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const inviteeContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const inviteePage = await inviteeContext.newPage();

    try {
      fixture = await createProductionInviteFixture(admin, inviteeEmail);
      await clearSetPasswordRateLimits(admin, inviteeEmail);

      await signIn(adminPage, fixture.inviter.email, fixture.password);
      await adminPage.goto("/admin/users");
      await adminPage.getByLabel(/^email$/i).fill(inviteeEmail);
      await adminPage.getByLabel(/^role$/i).selectOption("learner");
      await adminPage
        .getByLabel(`${fixture.prefix} Invite Role Group`)
        .check();
      await adminPage.getByRole("button", { name: /^send invite$/i }).click();
      await expect(
        adminPage.getByText(`Invite sent to ${inviteeEmail}`),
      ).toBeVisible();

      const inviteLink = await waitForEmailLink({
        config: emailConfig!,
        sentAfter,
        to: inviteeEmail,
        linkPattern: /\/auth\/v1\/verify\?.*(type=invite|type%3Dinvite)/,
      });

      await inviteePage.goto(inviteLink);
      await inviteePage.waitForURL(/\/auth\/set-password/, { timeout: 30_000 });
      await expect(inviteePage.getByLabel(/email/i)).toHaveValue(inviteeEmail);
      await inviteePage.getByLabel(/^new password$/i).fill(fixture.password);
      await inviteePage.getByLabel(/^confirm password$/i).fill(fixture.password);
      await inviteePage.getByRole("button", { name: /save and continue/i }).click();
      await inviteePage.waitForURL(/\/dashboard/, { timeout: 20_000 });
      await expect(
        inviteePage.getByText(`${fixture.prefix} Invite Program`),
      ).toBeVisible();

      await expect
        .poll(() => productionInviteWasAccepted(admin, fixture!), {
          timeout: 20_000,
        })
        .toBe(true);
    } finally {
      if (fixture) await clearSetPasswordRateLimits(admin, fixture.inviteeEmail);
      await adminContext.close();
      await inviteeContext.close();
      await cleanupProductionInviteFixture(admin, fixture);
    }
  });

  test("resets a real production user's password from the emailed recovery link", async ({
    browser,
  }) => {
    const emailConfig = emailCaptureConfigFromEnv();
    test.skip(
      !emailConfig,
      "PROD_READINESS_EMAIL_INBOX and PROD_READINESS_EMAIL_IMAP_PASS are required for real reset-link retrieval.",
    );

    const admin = productionAdminClient();
    const email = buildTaggedEmailAddress(
      emailConfig!.inbox,
      `prd-reset-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    );
    let fixture: ProductionRecoveryFixture | null = null;
    const sentAfter = new Date(Date.now() - 15_000);
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    try {
      fixture = await createProductionRecoveryFixture(admin, email);
      await clearSetPasswordRateLimits(admin, email);

      await page.goto("/forgot-password");
      await page.getByLabel(/email/i).fill(email);
      await page.getByRole("button", { name: /send reset link/i }).click();
      await expect(page.getByText(/check your inbox for a reset link/i)).toBeVisible();

      const resetLink = await waitForEmailLink({
        config: emailConfig!,
        sentAfter,
        to: email,
        linkPattern: /\/auth\/v1\/verify\?.*(type=recovery|type%3Drecovery)/,
      });

      await page.goto(resetLink);
      await page.waitForURL(/\/auth\/set-password/, { timeout: 30_000 });
      await expect(page.getByLabel(/email/i)).toHaveValue(email);
      await page.getByLabel(/^new password$/i).fill(fixture.newPassword);
      await page.getByLabel(/^confirm password$/i).fill(fixture.newPassword);
      await page.getByRole("button", { name: /save and continue/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

      await page.goto("/auth/signout");
      await signIn(page, email, fixture.newPassword);
    } finally {
      if (fixture) await clearSetPasswordRateLimits(admin, fixture.email);
      await context.close();
      await cleanupProductionRecoveryFixture(admin, fixture);
    }
  });
});

test.describe("production readiness rate limiting", () => {
  test("keeps forgot-password enumeration-safe after the email limit is consumed", async ({
    page,
  }) => {
    const admin = productionAdminClient();
    const email = `prd-ready-rate-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@bmh-institute.test`;

    try {
      await deleteRateLimitRows(admin, "email", email);

      await consumeEmailRateLimit(admin, email);

      await page.goto("/forgot-password");
      await page.getByLabel(/email/i).fill(email);
      await page.getByRole("button", { name: /send reset link/i }).click();
      await expect(
        page.getByText(/check your inbox for a reset link/i),
      ).toBeVisible();

      const { data, error } = await admin
        .from("auth_rate_limits")
        .select("count")
        .eq("key_type", "email")
        .eq("key_value", email)
        .order("count", { ascending: false })
        .limit(1)
        .maybeSingle();
      expect(error).toBeNull();
      expect((data?.count as number | undefined) ?? 0).toBeGreaterThanOrEqual(3);
    } finally {
      await deleteRateLimitRows(admin, "email", email);
    }
  });
});

async function deleteRateLimitRows(
  admin: ReturnType<typeof productionAdminClient>,
  keyType: "email" | "ip",
  keyValue: string,
) {
  const { error } = await admin
    .from("auth_rate_limits")
    .delete()
    .eq("key_type", keyType)
    .eq("key_value", keyValue);
  if (error) throw error;
}

async function consumeEmailRateLimit(
  admin: ReturnType<typeof productionAdminClient>,
  email: string,
) {
  for (let index = 0; index < 4; index += 1) {
    const { data, error } = await admin.rpc("fn_check_and_consume_rate_limit", {
      p_key_type: "email",
      p_key_value: email,
      p_threshold: 3,
      p_window_seconds: 60 * 60,
    });
    if (error) throw error;

    const row = (data as { allowed: boolean }[] | null)?.[0];
    if (index < 3) {
      expect(row?.allowed).toBe(true);
    } else {
      expect(row?.allowed).toBe(false);
    }
  }
}

async function clearSetPasswordRateLimits(
  admin: ReturnType<typeof productionAdminClient>,
  email: string,
): Promise<void> {
  await Promise.all([
    deleteRateLimitRows(admin, "email", email),
    deleteRateLimitRows(admin, "ip", "127.0.0.1"),
    deleteRateLimitRows(admin, "ip", "::1"),
    deleteRateLimitRows(admin, "ip", "::ffff:127.0.0.1"),
  ]);
}

async function productionInviteWasAccepted(
  admin: ReturnType<typeof productionAdminClient>,
  fixture: ProductionInviteFixture,
): Promise<boolean> {
  const [invite, profile] = await Promise.all([
    admin
      .from("invites")
      .select("accepted_at")
      .eq("email", fixture.inviteeEmail)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id, system_role, status")
      .eq("email", fixture.inviteeEmail)
      .maybeSingle(),
  ]);
  if (invite.error || profile.error || !profile.data?.id) return false;
  const roleGroups = await admin
    .from("user_role_groups")
    .select("role_group_id")
    .eq("user_id", profile.data.id as string)
    .eq("role_group_id", fixture.roleGroupId);
  if (roleGroups.error) return false;
  return Boolean(
    invite.data?.accepted_at &&
      profile.data?.system_role === "learner" &&
      profile.data?.status === "active" &&
      (roleGroups.data ?? []).length === 1,
  );
}
