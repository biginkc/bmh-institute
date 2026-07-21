import { describe, expect, it } from "vitest";

import { assertCanonicalSupabaseProjectUrl } from "./canonical-project-url";

const TEST_PROJECT_REF = "jvaabkchkihkjllehmft";
const TEST_PROJECT_URL = `https://${TEST_PROJECT_REF}.supabase.co`;

describe("assertCanonicalSupabaseProjectUrl", () => {
  it("accepts only the exact canonical HTTPS project origin", () => {
    expect(
      assertCanonicalSupabaseProjectUrl(TEST_PROJECT_URL, [TEST_PROJECT_REF]),
    ).toBe(TEST_PROJECT_REF);
    expect(
      assertCanonicalSupabaseProjectUrl(`${TEST_PROJECT_URL}/`, [
        TEST_PROJECT_REF,
      ]),
    ).toBe(TEST_PROJECT_REF);
  });

  it.each([
    `http://${TEST_PROJECT_REF}.supabase.co`,
    `https://${TEST_PROJECT_REF}.supabase.co.evil.example`,
    `https://evil-${TEST_PROJECT_REF}.supabase.co`,
    `https://${TEST_PROJECT_REF}.supabase.co@evil.example`,
    `https://${TEST_PROJECT_REF}.supabase.co:443`,
    `https://${TEST_PROJECT_REF}.supabase.co/auth/v1`,
    `https://${TEST_PROJECT_REF}.supabase.co?redirect=evil`,
    `https://${TEST_PROJECT_REF}.supabase.co#fragment`,
    "not-a-url",
  ])("rejects a misrouted or noncanonical project URL: %s", (candidate) => {
    expect(() =>
      assertCanonicalSupabaseProjectUrl(candidate, [TEST_PROJECT_REF]),
    ).toThrow(/canonical|outside the approved boundary/);
  });
});
