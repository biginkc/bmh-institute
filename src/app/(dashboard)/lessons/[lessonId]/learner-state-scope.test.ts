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
const loaderSource = readFileSync(
  resolve(process.cwd(), "src/app/(dashboard)/load-learner-outline.ts"),
  "utf8",
);

describe("lesson learner-state query scope", () => {
  it("passes the signed-in identity into quiz and assignment bodies", () => {
    expect(source).toContain("userId={auth.user.id}");
    expect(source).toContain("userId={userId}");
  });

  it("filters admin-visible attempts and submissions to that identity", () => {
    const quizBody = source.slice(source.indexOf("async function QuizLessonBody"));
    const assignmentBody = source.slice(
      source.indexOf("async function AssignmentLessonBody"),
    );
    expect(quizBody.slice(0, 5000)).toContain('.eq("user_id", userId)');
    expect(assignmentBody.slice(0, 3000)).toContain('.eq("user_id", userId)');
  });

  it("loads trusted lesson state in batches scoped to the signed-in identity", () => {
    const start = loaderSource.indexOf("loadLearnerLessonStates(supabase");
    const completionQuery = loaderSource.slice(start, start + 300);
    expect(completionQuery).toContain("userId");
    expect(completionQuery).toContain("lessons.map");
    expect(loaderSource).not.toContain("createAdminClient");
    expect(source).not.toContain('supabase.rpc("fn_lesson_is_complete"');
    expect(source).not.toContain('supabase.rpc("fn_lesson_is_unlocked"');
  });
});
