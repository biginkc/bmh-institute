import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/app/api/lesson-search/route.ts"),
  "utf8",
);

describe("authenticated lesson search route", () => {
  it("requires a verified user and leaves lesson visibility to learner RLS", () => {
    expect(source).toContain("auth.getUser()");
    expect(source).toContain("status: 401");
    expect(source).toContain('.from("lessons")');
    expect(source).not.toContain("createAdminClient");
  });

  it("bounds query and result sizes and disables private response caching", () => {
    expect(source).toContain("MAX_QUERY_LENGTH = 80");
    expect(source).toContain("MAX_RESULTS = 8");
    expect(source).toContain(".limit(MAX_RESULTS)");
    expect(source).toContain('"Cache-Control": "private, no-store"');
  });
});
