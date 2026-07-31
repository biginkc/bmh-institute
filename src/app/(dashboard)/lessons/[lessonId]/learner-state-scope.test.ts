import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/app/(dashboard)/lessons/[lessonId]/page.tsx"),
  "utf8",
);
const loaderSource = readFileSync(
  resolve(process.cwd(), "src/app/(dashboard)/load-learner-lesson-outline.ts"),
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
    expect(source).toContain("userId={user.id}");
    expect(source).toContain("getRequestAuthContext()");
    expect(source).toContain("userId={userId}");
    expect(source).toContain('tile.kind === "quiz"');
    expect(source).toContain("<StandaloneQuizLesson");
  });

  it("filters admin-visible attempts and submissions to that identity", () => {
    const quizBody = source.slice(
      source.indexOf("async function QuizLessonBody"),
    );
    const assignmentBody = source.slice(
      source.indexOf("async function AssignmentLessonBody"),
    );
    expect(quizBody.slice(0, 5000)).toContain('.eq("user_id", userId)');
    expect(assignmentBody.slice(0, 3000)).toContain('.eq("user_id", userId)');
  });

  it("loads trusted lesson state in batches scoped to the signed-in identity", () => {
    const start = loaderSource.indexOf(
      "loadLearnerCourseLessonStates(supabase",
    );
    const completionQuery = loaderSource.slice(start, start + 300);
    expect(completionQuery).toContain("courseId");
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

    expect(standalone).toContain("backHref={`/courses/${courseId}`}");
    expect(composite).toContain("courseId={courseId}");
    expect(partBody).toContain("courseId: string;");
    expect(partBody).toContain("backHref={`/courses/${courseId}`}");
    expect(standalone).not.toContain("backHref={`/lessons/${tile.id}`}");
    expect(partBody).not.toContain(
      "backHref={`/lessons/${tile.id}?part=quiz`}",
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

    expect(standalone).toMatch(/<a\s+ href=\{`\/courses\/\$\{courseId\}`\}/);
    expect(composite).toContain(
      'hardQuizNavigation = selected.kind === "quiz"',
    );
    expect(composite).toMatch(/<a\s+ href=\{`\/courses\/\$\{courseId\}`\}/);
    expect(composite).toContain("hardNavigation={hardQuizNavigation}");
    expect(composite).toMatch(/<a\s+ href=\{nextTile\.href\}/);
    expect(runnerSource).toContain("<a href={backHref}");
    expect(runnerSource).not.toContain(
      "<Link href={backHref} className={linkButtonClass}>Back to course</Link>",
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

describe("rail revisitability and video-invalidation copy", () => {
  it("derives every rail entry's href from part.available, the same flag prepareLearnerPart honors", () => {
    // The rail and the page's own part-selection must read the identical
    // `available` field from `buildLearnerLessonParts` — otherwise a
    // completed-but-gate-regressed part can be clickable in one place and
    // rejected in the other (2026-07-30 production finding: green-check
    // parts that refused to open).
    const composite = source.slice(
      source.indexOf("async function ContentCompositeLesson"),
      source.indexOf("async function PartBody"),
    );
    expect(composite).toContain("invalidatedBlockIds: tile.invalidatedBlockIds");
    expect(composite).toMatch(
      /href:\s*part\.available\s*\n?\s*\?\s*`\/lessons\/\$\{tile\.id\}\?part=\$\{encodeURIComponent\(part\.id\)\}`\s*\n?\s*:\s*null/,
    );
  });

  it("shows an update-specific notice for a video invalidated by an asset swap, distinct from an ordinary lock", () => {
    const partBody = source.slice(
      source.indexOf("async function PartBody"),
      source.indexOf("function LessonShell"),
    );
    expect(partBody).toContain("part.invalidated");
    expect(partBody).toContain("This video was updated");
    // Must not reuse or collide with the quiz's ordinary "locked" copy —
    // these are deliberately different messages for different situations.
    expect(partBody).toContain("Quiz locked");
  });
});
