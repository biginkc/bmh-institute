import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
  join(process.cwd(), "src/app/(dashboard)/layout.tsx"),
  { encoding: "utf8" },
);

describe("DashboardLayout sibling shell contract", () => {
  it("uses the BMH loop-series fixed sidebar and top bar", () => {
    expect(layoutSource).toContain("Logo");
    expect(layoutSource).toContain("SearchBar");
    expect(layoutSource).toContain("Avatar");
    expect(layoutSource).toContain("md:w-64");
    expect(layoutSource).toContain("md:left-64");
    expect(layoutSource).toContain("md:ml-64");
  });

  it("keeps notifications and the signed-in identity visible", () => {
    expect(layoutSource).toContain("Bell");
    expect(layoutSource).toContain("displayName");
    expect(layoutSource).toContain("roleLabel");
  });

  it("preserves the native sign-out POST contract", () => {
    expect(layoutSource).toContain('action="/auth/signout"');
    expect(layoutSource).toContain('method="post"');
    expect(layoutSource).toContain("Sign out");
  });
});
