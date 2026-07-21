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
const runnerSource = readFileSync(
  resolve(
    process.cwd(),
    "src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx",
  ),
  "utf8",
);
const progressRailSource = readFileSync(
  resolve(process.cwd(), "src/components/bmh-ds/progress-rail.tsx"),
  "utf8",
);
const lessonSearchSource = readFileSync(
  resolve(process.cwd(), "src/app/(dashboard)/lesson-search.tsx"),
  "utf8",
);

describe("lesson learner-state query scope", () => {
  it("passes the signed-in identity into quiz and assignment bodies", () => {
    expect(source).toContain("userId={auth.user.id}");
    expect(source).toContain("userId={userId}");
    expect(source).toContain('tile.kind === "quiz"');
    expect(source).toContain("<StandaloneQuizLesson");
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

  it("routes standalone and composite quiz results back to the owning course", () => {
    const standalone = source.slice(
      source.indexOf("async function StandaloneQuizLesson"),
      source.indexOf("async function ContentCompositeLesson"),
    );
    const composite = source.slice(
      source.indexOf("async function ContentCompositeLesson"),
      source.indexOf("async function PartBody"),
    );
    const partBody = source.slice(
      source.indexOf("async function PartBody"),
      source.indexOf("function LessonShell"),
    );

    expect(standalone).toContain('backHref={`/courses/${courseId}`}');
    expect(composite).toContain("courseId={courseId}");
    expect(partBody).toContain("courseId: string;");
    expect(partBody).toContain('backHref={`/courses/${courseId}`}');
    expect(standalone).not.toContain('backHref={`/lessons/${tile.id}`}');
    expect(partBody).not.toContain(
      'backHref={`/lessons/${tile.id}?part=quiz`}',
    );
  });

  it("crosses a document boundary when leaving a quiz", () => {
    const standalone = source.slice(
      source.indexOf("async function StandaloneQuizLesson"),
      source.indexOf("async function ContentCompositeLesson"),
    );
    const composite = source.slice(
      source.indexOf("async function ContentCompositeLesson"),
      source.indexOf("async function PartBody"),
    );

    expect(standalone).toContain('<a href={`/courses/${courseId}`}');
    expect(composite).toContain('hardQuizNavigation = selected.kind === "quiz"');
    expect(composite).toContain('<a href={`/courses/${courseId}`}');
    expect(composite).toContain("hardNavigation={hardQuizNavigation}");
    expect(composite).toContain('<a href={nextTile.href}');
    expect(runnerSource).toContain('<a href={backHref}');
    expect(runnerSource).not.toContain(
      '<Link href={backHref} className={linkButtonClass}>Back to course</Link>',
    );
    expect(runnerSource).toContain(
      'document.addEventListener("click", hardNavigateFromCompletedResult, true)',
    );
    expect(runnerSource).toContain(
      `event.preventDefault();
      event.stopPropagation();
      window.location.assign(destination.href)`,
    );
    expect(lessonSearchSource).toContain(
      "COMPLETED_QUIZ_HARD_NAVIGATION_ATTRIBUTE",
    );
    expect(lessonSearchSource).toContain("window.location.assign(lesson.href)");
    expect(progressRailSource).toContain("hardNavigation ? (");
    expect(progressRailSource).toContain("<a");
    expect(progressRailSource).toContain("href={entry.href}");
  });
});
