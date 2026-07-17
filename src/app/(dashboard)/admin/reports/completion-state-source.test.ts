import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const reportFiles = [
  "src/app/(dashboard)/admin/reports/page.tsx",
  "src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx",
  "src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx",
  "src/app/(dashboard)/admin/reports/users/[userId]/page.tsx",
  "src/app/(dashboard)/admin/reports/pilot/export/route.ts",
];

describe("admin report completion truth", () => {
  it("uses the dynamic admin batch RPC reader instead of the stale completion ledger", () => {
    for (const file of reportFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).toContain("loadAdminLessonCompletions");
      expect(source, file).not.toContain("user_lesson_completions");
    }
  });

  it("paginates every profile and lesson source used for completion reports", () => {
    for (const file of reportFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).toContain("loadAllReportRowsById");
      expect(source, file).toContain('count: "exact"');
      expect(source, file).toContain('.order("id", { ascending: true })');
    }
  });
});
