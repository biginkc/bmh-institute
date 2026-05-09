import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
  join(process.cwd(), "src/app/(dashboard)/layout.tsx"),
  { encoding: "utf8" },
);

describe("DashboardLayout sibling shell contract", () => {
  it("keeps the Sandra-style fixed header and desktop left rail", () => {
    expect(layoutSource).toContain("fixed inset-x-0 top-0");
    expect(layoutSource).toContain("h-16");
    expect(layoutSource).toContain("md:w-64");
    expect(layoutSource).toContain("top-16");
    expect(layoutSource).toContain("md:ml-64");
  });

  it("keeps the Stitch topbar identity controls", () => {
    expect(layoutSource).toContain("Bell");
    expect(layoutSource).toContain("roleLabel");
    expect(layoutSource).toContain("rounded-full px-2 py-0.5");
  });

  it("does not render a separate mobile-only nav strip outside the sibling shell", () => {
    expect(layoutSource).not.toContain('variant="mobile"');
    expect(layoutSource).not.toContain("md:hidden print:hidden");
  });
});
