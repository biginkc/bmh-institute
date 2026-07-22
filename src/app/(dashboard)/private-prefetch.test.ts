import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const privateNavigationFiles = [
  "src/app/(dashboard)/layout.tsx",
  "src/app/(dashboard)/sidebar-nav.tsx",
  "src/app/(dashboard)/lesson-search.tsx",
  "src/app/(dashboard)/learner-course-browser.tsx",
  "src/app/(dashboard)/dashboard/page.tsx",
  "src/app/(dashboard)/courses/[courseId]/page.tsx",
  "src/app/(dashboard)/lessons/[lessonId]/page.tsx",
  "src/app/(dashboard)/lessons/[lessonId]/quiz-gate-card.tsx",
  "src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx",
  "src/components/bmh-ds/progress-rail.tsx",
];

describe("private navigation prefetch contract", () => {
  it.each(privateNavigationFiles)("disables speculative server renders in %s", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    const linkTags = Array.from(source.matchAll(/<Link\b[\s\S]*?>/g), (match) => match[0]);
    expect(linkTags.length).toBeGreaterThan(0);
    for (const tag of linkTags) expect(tag).toContain("prefetch={false}");
  });
});
