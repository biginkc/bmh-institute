import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

describe("admin reports RPC diagnostics", () => {
  it("logs the underlying completion RPC error before rendering fail closed", () => {
    expect(page).toMatch(
      /if \(!completionResult\.ok\)[\s\S]*console\.error\([\s\S]*completionResult\.error[\s\S]*return \(/,
    );
  });
});
