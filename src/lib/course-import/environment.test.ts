import { describe, expect, it } from "vitest";

import {
  assertCourseImportEnvironment,
  COURSE_IMPORT_PRODUCTION_URL,
  COURSE_IMPORT_TEST_URL,
} from "./environment";

describe("assertCourseImportEnvironment", () => {
  it("allows only the exact canonical test host by default", () => {
    expect(assertCourseImportEnvironment(COURSE_IMPORT_TEST_URL, false)).toBe("test");
    expect(assertCourseImportEnvironment(`${COURSE_IMPORT_TEST_URL}/`, false)).toBe("test");
  });

  it("requires an explicit production gate on the exact canonical production host", () => {
    expect(() => assertCourseImportEnvironment(COURSE_IMPORT_PRODUCTION_URL, false)).toThrow(/production writes are blocked/i);
    expect(assertCourseImportEnvironment(COURSE_IMPORT_PRODUCTION_URL, true)).toBe("production");
  });

  it.each([
    "https://institute.bmhgroupkc.com",
    "https://dhvfsyteqsxagokoerrx.supabase.co.evil.example",
    "https://unknown.supabase.co",
    "https://user:password@jvaabkchkihkjllehmft.supabase.co",
    "https://jvaabkchkihkjllehmft.supabase.co/storage/v1",
    "https://jvaabkchkihkjllehmft.supabase.co?write=true",
    "https://jvaabkchkihkjllehmft.supabase.co#fragment",
    "http://jvaabkchkihkjllehmft.supabase.co",
    "not-a-url",
  ])("rejects aliases and non-canonical URL %s", (url) => {
    expect(() => assertCourseImportEnvironment(url, true)).toThrow();
  });
});
