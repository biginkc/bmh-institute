import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { assertHugoBrowserTarget } from "./hugo-browser-target";

describe("Hugo browser target deployment boundary", () => {
  it("keeps the Playwright config dependency outside Vercel's ignored e2e tree", () => {
    const root = resolve(process.cwd());
    const ignore = readFileSync(resolve(root, ".vercelignore"), "utf8");
    const playwrightConfig = readFileSync(
      resolve(root, "playwright.config.ts"),
      "utf8",
    );

    expect(ignore).toMatch(/^e2e\/$/m);
    expect(playwrightConfig).toContain(
      'from "./src/lib/testing/hugo-browser-target"',
    );
    expect(playwrightConfig).not.toContain(
      'from "./e2e/hugo-acceptance"',
    );
    expect(assertHugoBrowserTarget({ baseUrl: "http://localhost:3200" })).toEqual({
      baseUrl: "http://localhost:3200",
      production: false,
    });
  });
});
