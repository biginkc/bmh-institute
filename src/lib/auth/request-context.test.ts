import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/lib/auth/request-context.ts"),
  "utf8",
);

describe("request auth context", () => {
  it("memoizes one verified identity and profile lookup per React server render", () => {
    expect(source).toContain('import { cache } from "react"');
    expect(source).toContain('getRequestAuthContext = cache(() => withLessonTiming("dashboard-identity-profile"');
    expect(source.match(/auth\.getUser\(\)/g)).toHaveLength(1);
    expect(source.match(/\.from\("profiles"\)/g)).toHaveLength(1);
  });
});
