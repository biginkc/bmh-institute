import { expect, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

const TEST_PROJECT_REF = "jvaabkchkihkjllehmft";
const PROD_PROJECT_REF = "dhvfsyteqsxagokoerrx";

/**
 * Prove the public login surface remains Hugo-only. This helper never follows
 * the Hugo button because seeded workflow tests authenticate out of band.
 */
export async function expectHugoOnlyLogin(page: Page): Promise<void> {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: /^continue with hugo$/i }),
  ).toHaveCount(1);
  await expect(page.getByLabel(/email/i)).toHaveCount(0);
  await expect(page.getByLabel(/password/i)).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /forgot|reset|set password/i }),
  ).toHaveCount(0);
}

/**
 * Establish a disposable user's Supabase session without exercising any app
 * password UI. This is deliberately restricted to the dedicated Institute
 * test project and is unsuitable for production/browser acceptance proof.
 */
export async function bootstrapTestSession(
  page: Page,
  credentials: { email: string; password: string },
  destination = "/dashboard",
): Promise<void> {
  const url = process.env.TEST_SUPABASE_URL ?? "";
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) {
    throw new Error(
      "E2E session bootstrap requires the non-production test project.",
    );
  }
  if (url.includes(PROD_PROJECT_REF) || !url.includes(TEST_PROJECT_REF)) {
    throw new Error(
      `E2E session bootstrap expected non-production Supabase ref ${TEST_PROJECT_REF}.`,
    );
  }

  const authCookies = new Map<string, string>();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () =>
        [...authCookies].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) authCookies.set(name, value);
      },
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error || !data.user) {
    throw error ?? new Error("Failed to establish the test session.");
  }

  await page.goto("/login");
  const appOrigin = new URL(page.url()).origin;
  await page.context().clearCookies();
  await page.context().addCookies(
    [...authCookies].map(([name, value]) => ({
      name,
      value,
      url: appOrigin,
    })),
  );

  await page.goto(destination);
  await page.waitForURL(new RegExp(`${escapeRegex(destination)}(?:[?#]|$)`), {
    timeout: 20_000,
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
