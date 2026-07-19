import { describe, expect, it } from "vitest";

import {
  COURSE_IMPORT_PRODUCTION_URL,
  COURSE_IMPORT_TEST_URL,
} from "@/lib/course-import/environment";
import {
  assertIntegrationTestEnvironment,
  verifyIntegrationTestKeys,
} from "./integration-environment";

const safeEnvironment = {
  TEST_SUPABASE_URL: COURSE_IMPORT_TEST_URL,
  TEST_SUPABASE_ANON_KEY: `sb_publishable_${"a".repeat(24)}`,
  TEST_SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"s".repeat(24)}`,
  TEST_SUPABASE_DB_URL:
    "postgresql://postgres.jvaabkchkihkjllehmft:test-password@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
};

describe("assertIntegrationTestEnvironment", () => {
  it("refuses to report a credential-gated integration suite as passing when it would skip", () => {
    expect(() => assertIntegrationTestEnvironment({})).toThrow(
      /TEST_SUPABASE_URL.*TEST_SUPABASE_ANON_KEY.*TEST_SUPABASE_SERVICE_ROLE_KEY.*TEST_SUPABASE_DB_URL.*skipped suite/,
    );
  });

  it("accepts only the exact durable BMH Institute test project", () => {
    expect(() => assertIntegrationTestEnvironment(safeEnvironment)).not.toThrow();
  });

  it.each([
    COURSE_IMPORT_PRODUCTION_URL,
    `${COURSE_IMPORT_PRODUCTION_URL}.evil.example`,
    "http://jvaabkchkihkjllehmft.supabase.co",
    "https://unexpected.supabase.co",
  ])("rejects unsafe integration target %s", (url) => {
    expect(() => assertIntegrationTestEnvironment({
      ...safeEnvironment,
      TEST_SUPABASE_URL: url,
    })).toThrow();
  });

  it.each([
    "postgresql://postgres.dhvfsyteqsxagokoerrx:secret@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
    "postgresql://postgres.jvaabkchkihkjllehmft:secret@db.jvaabkchkihkjllehmft.supabase.co:5432/postgres",
    "https://postgres.jvaabkchkihkjllehmft:secret@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
    "not-a-url",
    "postgresql://other.jvaabkchkihkjllehmft:secret@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
    "postgresql://postgres.jvaabkchkihkjllehmft@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
    "postgresql://postgres.jvaabkchkihkjllehmft:secret@aws-1-us-west-1.pooler.supabase.com:6543/postgres",
    "postgresql://postgres.jvaabkchkihkjllehmft:secret@aws-1-us-west-1.pooler.supabase.com:5432/template1",
    "postgresql://postgres.jvaabkchkihkjllehmft:secret@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require",
    "postgresql://postgres.jvaabkchkihkjllehmft:secret@aws-1-us-west-1.pooler.supabase.com:5432/postgres#unexpected",
  ])("rejects unsafe integration database target %s", (databaseUrl) => {
    expect(() => assertIntegrationTestEnvironment({
      ...safeEnvironment,
      TEST_SUPABASE_DB_URL: databaseUrl,
    })).toThrow(/(?:valid|canonical) non-production Postgres connection/);
  });

  it.each([
    ["TEST_SUPABASE_ANON_KEY", `sb_secret_${"s".repeat(24)}`],
    ["TEST_SUPABASE_SERVICE_ROLE_KEY", `sb_publishable_${"a".repeat(24)}`],
    ["TEST_SUPABASE_ANON_KEY", "not-a-key"],
    ["TEST_SUPABASE_SERVICE_ROLE_KEY", "not-a-key"],
  ])("rejects a key that cannot have the required TEST role: %s", (name, key) => {
    expect(() => assertIntegrationTestEnvironment({
      ...safeEnvironment,
      [name]: key,
    })).toThrow(new RegExp(`${name}.*canonical BMH Institute TEST project`));
  });

  it("verifies both structurally valid keys against the canonical TEST HTTP project", async () => {
    const calls: Array<[URL | RequestInfo, RequestInit | undefined]> = [];
    const fetchMock = (async (
      input: URL | RequestInfo,
      init?: RequestInit,
    ) => {
      calls.push([input, init]);
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    await expect(
      verifyIntegrationTestKeys(safeEnvironment, fetchMock),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
    for (const [url, init] of calls) {
      expect(String(url)).toBe(`${COURSE_IMPORT_TEST_URL}/auth/v1/settings`);
      expect((init?.headers as Record<string, string>).apikey).toMatch(
        /^(?:sb_publishable_|sb_secret_)/,
      );
    }
  });

  it("fails before tests when a key is not accepted by the canonical TEST project", async () => {
    const fetchMock = (async (
      _input: URL | RequestInfo,
      init?: RequestInit,
    ) => new Response(null, {
      status: String((init?.headers as Record<string, string>)?.apikey).startsWith(
        "sb_secret_",
      )
        ? 401
        : 200,
    })) as typeof fetch;

    await expect(
      verifyIntegrationTestKeys(safeEnvironment, fetchMock),
    ).rejects.toThrow(
      /TEST_SUPABASE_SERVICE_ROLE_KEY.*not accepted.*canonical BMH Institute TEST project/,
    );
  });
});
