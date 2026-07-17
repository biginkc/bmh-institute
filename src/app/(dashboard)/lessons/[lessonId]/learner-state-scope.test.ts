import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "src/app/(dashboard)/lessons/[lessonId]/page.tsx",
  ),
  "utf8",
);

describe("lesson learner-state query scope", () => {
  it("passes the signed-in identity into quiz and assignment bodies", () => {
    expect(source).toMatch(/<QuizLessonBody[\s\S]*userId=\{user\.id\}/);
    expect(source).toMatch(/<AssignmentLessonBody[\s\S]*userId=\{user\.id\}/);
  });

  it("filters admin-visible attempts and submissions to that identity", () => {
    const quizBody = source.slice(source.indexOf("async function QuizLessonBody"));
    const assignmentBody = source.slice(
      source.indexOf("async function AssignmentLessonBody"),
    );
    expect(quizBody.slice(0, 5000)).toContain('.eq("user_id", userId)');
    expect(assignmentBody.slice(0, 3000)).toContain('.eq("user_id", userId)');
  });

  it("filters the top-level lesson completion to the signed-in identity", () => {
    const start = source.indexOf('.from("user_lesson_completions")');
    const completionQuery = source.slice(start, start + 400);
    expect(completionQuery).toContain('.eq("user_id", user.id)');
    expect(completionQuery).toContain('.eq("lesson_id", lessonId)');
  });
});
