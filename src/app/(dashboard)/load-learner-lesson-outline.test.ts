import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/app/(dashboard)/load-learner-lesson-outline.ts"),
  "utf8",
);

describe("lesson-specific learner outline query contract", () => {
  it("loads a lightweight course projection and only the current lesson blocks", () => {
    expect(source).not.toContain("content_blocks (");
    expect(source).toContain('.from("content_blocks")');
    expect(source).toContain('.eq("lesson_id", lessonId)');
  });

  it("does not fetch course resume state and scopes block progress to current blocks", () => {
    expect(source).not.toContain("user_course_resume");
    expect(source).toContain("currentBlocks.map((block) => block.id)");
  });

  it("bounds assignment state to the requested assignment lesson", () => {
    expect(source).toContain('lesson.lessonType === "assignment"');
    expect(source).toContain('.eq("lesson_id", lessonId)');
    expect(source).not.toContain('in("lesson_id", assignmentLessonIds)');
  });
});
