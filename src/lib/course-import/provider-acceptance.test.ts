import { describe, expect, it } from "vitest";

import { COURSE_IMPORT_TEST_URL } from "./environment";
import {
  assertCourseImportProviderAcceptanceEnvironment,
  assertCourseImportProviderAcceptanceResult,
  courseImportProviderPsqlEnvironment,
  providerAcceptanceFailureLines,
} from "./provider-acceptance";

describe("course import provider acceptance preflight", () => {
  it("fails before Vitest when any dedicated test credential is absent", () => {
    expect(() => assertCourseImportProviderAcceptanceEnvironment({})).toThrow(
      /TEST_SUPABASE_URL.*TEST_SUPABASE_ANON_KEY.*TEST_SUPABASE_SERVICE_ROLE_KEY.*TEST_SUPABASE_DB_URL/,
    );
  });

  it("accepts only the canonical non-production project", () => {
    expect(() => assertCourseImportProviderAcceptanceEnvironment({
      TEST_SUPABASE_URL: COURSE_IMPORT_TEST_URL,
      TEST_SUPABASE_ANON_KEY: "test-anon",
      TEST_SUPABASE_SERVICE_ROLE_KEY: "test-service",
      TEST_SUPABASE_DB_URL: "postgresql://postgres.jvaabkchkihkjllehmft:test@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
    })).not.toThrow();
    expect(() => assertCourseImportProviderAcceptanceEnvironment({
      TEST_SUPABASE_URL: "https://dhvfsyteqsxagokoerrx.supabase.co",
      TEST_SUPABASE_ANON_KEY: "prod-anon",
      TEST_SUPABASE_SERVICE_ROLE_KEY: "prod-service",
      TEST_SUPABASE_DB_URL: "postgresql://postgres.jvaabkchkihkjllehmft:test@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
    })).toThrow(/Production writes are blocked/);
    expect(() => assertCourseImportProviderAcceptanceEnvironment({
      TEST_SUPABASE_URL: COURSE_IMPORT_TEST_URL,
      TEST_SUPABASE_ANON_KEY: "test-anon",
      TEST_SUPABASE_SERVICE_ROLE_KEY: "test-service",
      TEST_SUPABASE_DB_URL: "postgresql://postgres.dhvfsyteqsxagokoerrx:test@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
    })).toThrow(/canonical non-production Postgres connection/);
  });

  it.each([
    "postgresql://readonly.jvaabkchkihkjllehmft:test@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
    "postgresql://postgres.jvaabkchkihkjllehmft@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
    "postgresql://postgres.jvaabkchkihkjllehmft:test@aws-1-us-west-1.pooler.supabase.com:6543/postgres",
    "postgresql://postgres.jvaabkchkihkjllehmft:test@aws-1-us-west-1.pooler.supabase.com:5432/template1",
    "postgresql://postgres.jvaabkchkihkjllehmft:test@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require",
    "postgresql://postgres.jvaabkchkihkjllehmft:test@aws-1-us-west-1.pooler.supabase.com:5432/postgres#unexpected",
  ])("rejects a noncanonical TEST database URL field: %s", (databaseUrl) => {
    expect(() => assertCourseImportProviderAcceptanceEnvironment({
      TEST_SUPABASE_URL: COURSE_IMPORT_TEST_URL,
      TEST_SUPABASE_ANON_KEY: "test-anon",
      TEST_SUPABASE_SERVICE_ROLE_KEY: "test-service",
      TEST_SUPABASE_DB_URL: databaseUrl,
    })).toThrow(/canonical non-production Postgres connection/);
  });

  it("requires nonzero executed tests from every provider suite", () => {
    expect(assertCourseImportProviderAcceptanceResult({
      numTotalTests: 14,
      numPassedTests: 14,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      testResults: providerFiles(3),
    }, 3)).toEqual({ files: 3, tests: 14 });
    expect(() => assertCourseImportProviderAcceptanceResult({
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      testResults: [],
    }, 3)).toThrow(/nonzero/);
    expect(() => assertCourseImportProviderAcceptanceResult({
      numTotalTests: 14,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 14,
      numTodoTests: 0,
      testResults: providerFiles(3, "pending"),
    }, 3)).toThrow(/no failures or skips/);
    expect(() => assertCourseImportProviderAcceptanceResult({
      numTotalTests: 2,
      numPassedTests: 2,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      testResults: [...providerFiles(2), { status: "passed", assertionResults: [] }],
    }, 3)).toThrow(/fully executed/);
  });

  it("redacts raw and URL-encoded credentials from every report-derived field", () => {
    const rawSecret = "s3cret+/with spaces";
    const encodedSecret = encodeURIComponent(rawSecret);
    const lines = providerAcceptanceFailureLines({
      testResults: [{
        name: `/tmp/${rawSecret}/provider.test.ts`,
        status: "failed",
        message: `file message ${encodedSecret}`,
        assertionResults: [{
          title: `assertion ${rawSecret}`,
          status: "failed",
          failureMessages: [`failure ${encodedSecret}`],
        }],
      }],
    }, [rawSecret]);
    const output = lines.join("\n");
    expect(output).not.toContain(rawSecret);
    expect(output).not.toContain(encodedSecret);
    expect(output.match(/\[REDACTED\]/g)?.length).toBe(4);
  });

  it("maps the canonical URI to libpq fields without putting its password in arguments", () => {
    expect(courseImportProviderPsqlEnvironment(
      "postgresql://postgres.jvaabkchkihkjllehmft:p%40ss%2Fword@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
    )).toEqual({
      PGHOST: "aws-1-us-west-1.pooler.supabase.com",
      PGPORT: "5432",
      PGDATABASE: "postgres",
      PGUSER: "postgres.jvaabkchkihkjllehmft",
      PGPASSWORD: "p@ss/word",
      PGSSLMODE: "require",
    });
  });
});

function providerFiles(count: number, status = "passed") {
  return Array.from({ length: count }, () => ({
    status: status === "passed" ? "passed" : "pending",
    assertionResults: [{ status }],
  }));
}
