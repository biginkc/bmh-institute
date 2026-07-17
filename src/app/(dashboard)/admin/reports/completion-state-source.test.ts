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

type SourceMode = "id" | "composite" | "bounded" | "single";

type SourceSpec = {
  table: string;
  result: string;
  mode: SourceMode;
};

const sourceInventory: Record<string, SourceSpec[]> = {
  "src/app/(dashboard)/admin/reports/page.tsx": [
    { table: "profiles", result: "profilesResult", mode: "id" },
    { table: "programs", result: "programsResult", mode: "id" },
    { table: "courses", result: "coursesResult", mode: "id" },
    { table: "certificates", result: "courseCertsResult", mode: "id" },
    {
      table: "program_certificates",
      result: "programCertsResult",
      mode: "id",
    },
    { table: "audit_log", result: "auditRes", mode: "bounded" },
    {
      table: "user_quiz_attempts",
      result: "quizAttemptsResult",
      mode: "id",
    },
    {
      table: "assignment_submissions",
      result: "submissionsResult",
      mode: "id",
    },
    { table: "lessons", result: "lessonCourseResult", mode: "id" },
    {
      table: "user_role_groups",
      result: "userRoleGroupsResult",
      mode: "composite",
    },
  ],
  "src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx": [
    { table: "courses", result: "courseRes", mode: "single" },
    { table: "lessons", result: "courseLessonsResult", mode: "id" },
    { table: "certificates", result: "certsResult", mode: "id" },
    { table: "profiles", result: "accessibleUsersResult", mode: "id" },
  ],
  "src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx": [
    { table: "programs", result: "programRes", mode: "single" },
    {
      table: "program_courses",
      result: "programCoursesResult",
      mode: "id",
    },
    { table: "lessons", result: "lessonsResult", mode: "id" },
    { table: "certificates", result: "courseCertsResult", mode: "id" },
    {
      table: "program_certificates",
      result: "programCertsResult",
      mode: "id",
    },
    { table: "profiles", result: "profilesResult", mode: "id" },
  ],
  "src/app/(dashboard)/admin/reports/users/[userId]/page.tsx": [
    { table: "profiles", result: "profileRes", mode: "single" },
    {
      table: "user_role_groups",
      result: "roleGroupsResult",
      mode: "composite",
    },
    { table: "programs", result: "programsResult", mode: "id" },
    {
      table: "program_courses",
      result: "programCoursesResult",
      mode: "id",
    },
    { table: "course_access", result: "courseAccessResult", mode: "id" },
    { table: "lessons", result: "lessonsResult", mode: "id" },
    { table: "certificates", result: "certificatesResult", mode: "id" },
    {
      table: "program_certificates",
      result: "programCertsResult",
      mode: "id",
    },
    {
      table: "user_quiz_attempts",
      result: "attemptsResult",
      mode: "id",
    },
    {
      table: "role_play_results",
      result: "rolePlayResultsResult",
      mode: "id",
    },
    { table: "audit_log", result: "auditRes", mode: "bounded" },
  ],
  "src/app/(dashboard)/admin/reports/pilot/export/route.ts": [
    { table: "profiles", result: "profilesResult", mode: "id" },
    {
      table: "user_role_groups",
      result: "userRoleGroupsResult",
      mode: "composite",
    },
    { table: "lessons", result: "requiredLessonsResult", mode: "id" },
    {
      table: "user_quiz_attempts",
      result: "quizAttemptsResult",
      mode: "id",
    },
    {
      table: "assignment_submissions",
      result: "submissionsResult",
      mode: "id",
    },
    { table: "certificates", result: "courseCertsResult", mode: "id" },
    {
      table: "program_certificates",
      result: "programCertsResult",
      mode: "id",
    },
  ],
};

describe("admin report completion truth", () => {
  it("uses the dynamic admin batch RPC reader instead of the stale completion ledger", () => {
    for (const file of reportFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).toContain("loadAdminLessonCompletions");
      expect(source, file).not.toContain("user_lesson_completions");
    }
  });

  it("exhaustively inventories, bounds, and fail-closes every report query", () => {
    expect(Object.keys(sourceInventory)).toEqual(reportFiles);

    for (const [file, specs] of Object.entries(sourceInventory)) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      const actualTables = Array.from(
        source.matchAll(/\.from\("([^"]+)"\)/g),
        (match) => match[1],
      );
      expect(actualTables, `${file}: update the complete source inventory`).toEqual(
        specs.map((spec) => spec.table),
      );

      const expectedIdCalls = specs.filter((spec) => spec.mode === "id").length;
      const expectedCompositeCalls = specs.filter(
        (spec) => spec.mode === "composite",
      ).length;
      expect(
        source.match(/loadAllReportRowsById(?:<[^>]+>)?\(/g)?.length ?? 0,
        file,
      ).toBe(expectedIdCalls);
      expect(
        source.match(/loadAllReportRowsByCursor\(/g)?.length ?? 0,
        file,
      ).toBe(expectedCompositeCalls);

      let previousTableIndex = -1;
      for (const spec of specs) {
        const tableMarker = `.from("${spec.table}")`;
        const tableIndex = source.indexOf(tableMarker, previousTableIndex + 1);
        expect(tableIndex, `${file}: missing ${spec.table}`).toBeGreaterThan(
          previousTableIndex,
        );

        if (spec.mode === "id" || spec.mode === "composite") {
          const helperName =
            spec.mode === "id"
              ? "loadAllReportRowsById"
              : "loadAllReportRowsByCursor";
          const helperIndex = source.lastIndexOf(helperName, tableIndex);
          expect(
            helperIndex,
            `${file}: ${spec.table} must use ${helperName}`,
          ).toBeGreaterThan(previousTableIndex);

          const nextHelperIndexes = [
            source.indexOf("loadAllReportRowsById", tableIndex + 1),
            source.indexOf("loadAllReportRowsByCursor", tableIndex + 1),
          ].filter((index) => index >= 0);
          const queryEnd =
            nextHelperIndexes.length > 0
              ? Math.min(...nextHelperIndexes)
              : source.length;
          const query = source.slice(helperIndex, queryEnd);
          expect(query, `${file}: ${spec.table} exact count`).toContain(
            'count: "exact"',
          );
          expect(query, `${file}: ${spec.table} bounded page`).toContain(
            ".limit(limit)",
          );
          if (spec.mode === "id") {
            expect(query, `${file}: ${spec.table} stable ID order`).toContain(
              '.order("id", { ascending: true })',
            );
            expect(query, `${file}: ${spec.table} ID cursor`).toContain(
              "afterId",
            );
          } else {
            expect(query, `${file}: ${spec.table} user order`).toContain(
              '.order("user_id", { ascending: true })',
            );
            expect(query, `${file}: ${spec.table} group order`).toContain(
              '.order("role_group_id", { ascending: true })',
            );
            expect(query, `${file}: ${spec.table} composite cursor`).toContain(
              "query.or(",
            );
          }
          expect(
            source,
            `${file}: ${spec.result} errors must fail closed`,
          ).toContain(`!${spec.result}.ok`);
        } else if (spec.mode === "bounded") {
          const query = source.slice(tableIndex, tableIndex + 500);
          expect(query, `${file}: ${spec.table} explicit limit`).toMatch(
            /\.limit\((20|40)\)/,
          );
          expect(source, `${file}: ${spec.result} errors must fail closed`).toContain(
            `${spec.result}.error`,
          );
        } else {
          const query = source.slice(tableIndex, tableIndex + 500);
          expect(query, `${file}: ${spec.table} singleton`).toContain(
            ".maybeSingle()",
          );
          expect(source, `${file}: ${spec.result} errors must fail closed`).toContain(
            `${spec.result}.error`,
          );
        }

        previousTableIndex = tableIndex;
      }
    }
  });
});
