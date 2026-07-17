import { describe, expect, it } from "vitest";

import {
  COURSE_IMPORT_PRODUCTION_URL,
  COURSE_IMPORT_TEST_URL,
} from "@/lib/course-import/environment";
import { assertIntegrationTestEnvironment } from "./integration-environment";

const safeEnvironment = {
  TEST_SUPABASE_URL: COURSE_IMPORT_TEST_URL,
  TEST_SUPABASE_ANON_KEY: "test-anon",
  TEST_SUPABASE_SERVICE_ROLE_KEY: "test-service",
};

describe("assertIntegrationTestEnvironment", () => {
  it("refuses to report a credential-gated integration suite as passing when it would skip", () => {
    expect(() => assertIntegrationTestEnvironment({})).toThrow(
      /TEST_SUPABASE_URL.*TEST_SUPABASE_ANON_KEY.*TEST_SUPABASE_SERVICE_ROLE_KEY.*skipped suite/,
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
});
