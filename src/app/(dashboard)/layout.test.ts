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
    expect(layoutSource).toContain("LessonSearch");
    expect(layoutSource).toContain("MobileNav");
    expect(layoutSource).toContain("Avatar");
    expect(layoutSource).toContain("md:w-64");
    expect(layoutSource).toContain("md:left-64");
    expect(layoutSource).toContain("md:ml-64");
  });

  it("keeps primary navigation reachable through the mobile shell", () => {
    expect(layoutSource).toContain("<MobileNav");
    expect(layoutSource).toContain("pendingSubmissionsCount={pendingSubmissions}");
  });

  it("uses compact spacing without shrinking the 320px header controls", () => {
    expect(layoutSource).toContain("gap-2");
    expect(layoutSource).toContain("px-2");
    expect(layoutSource).toContain("sm:gap-4");
    expect(layoutSource).toContain("shrink-0 sm:hidden");
    expect(layoutSource).toContain("size-10 shrink-0");
  });

  it("removes the dead notification control and keeps signed-in identity visible", () => {
    expect(layoutSource).not.toContain("Bell");
    expect(layoutSource).not.toContain("Notifications");
    expect(layoutSource).toContain("displayName");
    expect(layoutSource).toContain("roleLabel");
  });

  it("keeps a compact lesson search reachable below the small breakpoint", () => {
    expect(layoutSource).toContain('instanceId="mobile"');
    expect(layoutSource).toContain("compact");
    expect(layoutSource).toContain("sm:hidden");
    expect(layoutSource).toContain('instanceId="desktop"');
  });

  it("preserves the native sign-out POST contract", () => {
    expect(layoutSource).toContain('action="/auth/signout"');
    expect(layoutSource).toContain('method="post"');
    expect(layoutSource).toContain("Sign out");
  });
});
