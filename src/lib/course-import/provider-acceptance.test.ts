import { describe, expect, it } from "vitest";

import { COURSE_IMPORT_TEST_URL } from "./environment";
import {
  assertCourseImportProviderAcceptanceEnvironment,
  assertCourseImportProviderAcceptanceResult,
} from "./provider-acceptance";

describe("course import provider acceptance preflight", () => {
  it("fails before Vitest when any dedicated test credential is absent", () => {
    expect(() => assertCourseImportProviderAcceptanceEnvironment({})).toThrow(
      /TEST_SUPABASE_URL.*TEST_SUPABASE_ANON_KEY.*TEST_SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("accepts only the canonical non-production project", () => {
    expect(() => assertCourseImportProviderAcceptanceEnvironment({
      TEST_SUPABASE_URL: COURSE_IMPORT_TEST_URL,
      TEST_SUPABASE_ANON_KEY: "test-anon",
      TEST_SUPABASE_SERVICE_ROLE_KEY: "test-service",
    })).not.toThrow();
    expect(() => assertCourseImportProviderAcceptanceEnvironment({
      TEST_SUPABASE_URL: "https://dhvfsyteqsxagokoerrx.supabase.co",
      TEST_SUPABASE_ANON_KEY: "prod-anon",
      TEST_SUPABASE_SERVICE_ROLE_KEY: "prod-service",
    })).toThrow(/Production writes are blocked/);
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
});

function providerFiles(count: number, status = "passed") {
  return Array.from({ length: count }, () => ({
    status: status === "passed" ? "passed" : "pending",
    assertionResults: [{ status }],
  }));
}
