import { describe, expect, it } from "vitest";

import {
  buildLearnerCourseOutline,
  type LearnerOutlineBuildInput,
  type LearnerOutlineLesson,
} from "./learner-outline";

function contentLesson(id: string, sortOrder: number): LearnerOutlineLesson {
  return {
    id,
    title: `Lesson ${id}`,
    description: null,
    lessonType: "content",
    sortOrder,
    prerequisiteLessonId: null,
    quizId: null,
    assignmentId: null,
    isRequiredForCompletion: true,
    thumbnailPath: null,
    contentImportId: null,
    thumbnailAssetKey: null,
    thumbnailApprovedPath: null,
    thumbnailApprovedSha256: null,
    blocks: [
      {
        id: `video-${id}`,
        block_type: "video",
        content: { title: `Video ${id}` },
        sort_order: 1,
        is_required_for_completion: true,
      },
    ],
  };
}

function quizLesson(
  id: string,
  prerequisiteLessonId: string,
  sortOrder: number,
): LearnerOutlineLesson {
  return {
    ...contentLesson(id, sortOrder),
    title: `Quiz ${id}`,
    lessonType: "quiz",
    prerequisiteLessonId,
    quizId: `quiz-record-${id}`,
    blocks: [],
  };
}

function assignmentLesson(id: string, sortOrder: number): LearnerOutlineLesson {
  return {
    ...contentLesson(id, sortOrder),
    title: `Assignment ${id}`,
    lessonType: "assignment",
    assignmentId: `assignment-record-${id}`,
    blocks: [],
  };
}

function buildInput(lessons: LearnerOutlineLesson[]): LearnerOutlineBuildInput {
  return {
    course: {
      id: "course-1",
      title: "BMH Employee Training",
      description: "Course description",
      isPublished: false,
      thumbnailPath: null,
      contentImportId: null,
      thumbnailAssetKey: null,
      thumbnailApprovedPath: null,
      thumbnailApprovedSha256: null,
      modules: [
        {
          id: "module-1",
          title: "Foundations",
          description: null,
          sortOrder: 1,
          lessons,
        },
      ],
    },
    states: new Map(
      lessons.map((lesson) => [
        lesson.id,
        { lessonId: lesson.id, isComplete: false, isUnlocked: true },
      ]),
    ),
    assignmentSubmissions: new Map(),
    completedBlockIds: new Set<string>(),
    resume: null,
  };
}

describe("buildLearnerCourseOutline", () => {
  it("projects content plus its quiz into one tile and leaves assignments standalone", () => {
    const content = Array.from({ length: 19 }, (_, index) =>
      contentLesson(`content-${index + 1}`, index * 3),
    );
    const quizzes = content.map((lesson, index) =>
      quizLesson(`quiz-${index + 1}`, lesson.id, index * 3 + 1),
    );
    const assignments = Array.from({ length: 6 }, (_, index) =>
      assignmentLesson(`assignment-${index + 1}`, index * 3 + 2),
    );

    const result = buildLearnerCourseOutline(
      buildInput([...content, ...quizzes, ...assignments]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outline.tiles).toHaveLength(25);
    expect(result.outline.tiles.filter((tile) => tile.kind === "content")).toHaveLength(19);
    expect(result.outline.tiles.filter((tile) => tile.kind === "assignment")).toHaveLength(6);
    expect(result.outline.tiles.map((tile) => tile.lessonNumber)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
  });

  it("fails closed when a content lesson has no immediately-dependent quiz", () => {
    const result = buildLearnerCourseOutline(buildInput([contentLesson("content", 1)]));

    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/exactly one.*quiz.*found 0/i),
    });
  });

  it("fails closed when multiple quizzes depend on the same content lesson", () => {
    const result = buildLearnerCourseOutline(
      buildInput([
        contentLesson("content", 1),
        quizLesson("quiz-a", "content", 2),
        quizLesson("quiz-b", "content", 3),
      ]),
    );

    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/exactly one.*quiz.*found 2/i),
    });
  });

  it("fails closed for a null quiz record, an orphan quiz, or cross-module pairing", () => {
    const nullQuiz = quizLesson("quiz", "content", 2);
    nullQuiz.quizId = null;
    expect(
      buildLearnerCourseOutline(buildInput([contentLesson("content", 1), nullQuiz])),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/quiz record/i) });

    expect(
      buildLearnerCourseOutline(
        buildInput([
          contentLesson("content", 1),
          quizLesson("quiz", "content", 2),
          quizLesson("orphan", "missing", 3),
        ]),
      ),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/orphan/i) });

    const crossModule = buildInput([
      contentLesson("content", 1),
      quizLesson("quiz", "content", 2),
    ]);
    const quiz = crossModule.course.modules[0].lessons.pop()!;
    crossModule.course.modules.push({
      id: "module-2",
      title: "Advanced",
      description: null,
      sortOrder: 2,
      lessons: [quiz],
    });
    expect(buildLearnerCourseOutline(crossModule)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/same module/i),
    });
  });

  it("requires both the content row and paired quiz to complete a composite tile", () => {
    const input = buildInput([
      contentLesson("content", 1),
      quizLesson("quiz", "content", 2),
    ]);
    input.states.set("content", {
      lessonId: "content",
      isComplete: true,
      isUnlocked: true,
    });
    input.completedBlockIds.add("video-content");

    const result = buildLearnerCourseOutline(input);

    expect(result.ok && result.outline.tiles[0]).toMatchObject({
      complete: false,
      state: "current",
      pairedQuizLessonId: "quiz",
      completedBlockIds: new Set(["video-content"]),
    });
  });

  it("maps old quiz and block resume records into the composite lesson route", () => {
    const input = buildInput([
      contentLesson("content", 1),
      quizLesson("quiz", "content", 2),
    ]);
    input.states.set("content", {
      lessonId: "content",
      isComplete: true,
      isUnlocked: true,
    });
    input.resume = {
      lastLessonId: "quiz",
      lastBlockId: null,
    };

    const quizResume = buildLearnerCourseOutline(input);
    expect(quizResume.ok && quizResume.outline.resume?.href).toBe(
      "/lessons/content?part=quiz",
    );

    input.states.set("content", {
      lessonId: "content",
      isComplete: false,
      isUnlocked: true,
    });
    input.resume = {
      lastLessonId: "content",
      lastBlockId: "video-content",
    };
    const blockResume = buildLearnerCourseOutline(input);
    expect(blockResume.ok && blockResume.outline.resume?.href).toBe(
      "/lessons/content?part=video-1",
    );

    input.resume = { lastLessonId: null, lastBlockId: "video-content" };
    const blockOnlyResume = buildLearnerCourseOutline(input);
    expect(blockOnlyResume.ok && blockOnlyResume.outline.resume?.href).toBe(
      "/lessons/content?part=video-1",
    );
  });

  it("never resumes into a pre-pass guide or a locked quiz", () => {
    const content = contentLesson("content", 1);
    content.blocks.push({
      id: "guide-content",
      block_type: "download",
      content: { file_path: "courses/x/guides/learner-guide.pdf" },
      sort_order: 2,
      is_required_for_completion: false,
    });
    const input = buildInput([content, quizLesson("quiz", "content", 2)]);
    input.states.set("quiz", { lessonId: "quiz", isComplete: false, isUnlocked: false });
    input.resume = { lastLessonId: "content", lastBlockId: "guide-content" };
    const guideResume = buildLearnerCourseOutline(input);
    expect(guideResume.ok && guideResume.outline.resume?.href).toBe(
      "/lessons/content?part=video-1",
    );
    input.resume = { lastLessonId: "quiz", lastBlockId: "video-content" };
    const lockedQuizResume = buildLearnerCourseOutline(input);
    expect(lockedQuizResume.ok && lockedQuizResume.outline.resume?.href).toBe(
      "/lessons/content?part=video-1",
    );
  });

  it("surfaces assignment review states and keeps an awaiting-review tile current", () => {
    const input = buildInput([
      contentLesson("content", 1),
      quizLesson("quiz", "content", 2),
      assignmentLesson("assignment", 3),
    ]);
    input.states.set("content", {
      lessonId: "content",
      isComplete: true,
      isUnlocked: true,
    });
    input.states.set("quiz", {
      lessonId: "quiz",
      isComplete: true,
      isUnlocked: true,
    });
    input.assignmentSubmissions.set("assignment", "submitted");

    const result = buildLearnerCourseOutline(input);

    expect(result.ok && result.outline.tiles[1]).toMatchObject({
      state: "awaiting_review",
      complete: false,
    });
    expect(result.ok && result.outline.resume?.label).toMatch(/awaiting review/i);
  });

  it("prioritizes needs-revision work and leaves the following lesson locked", () => {
    const input = buildInput([
      contentLesson("content", 1),
      quizLesson("quiz", "content", 2),
      assignmentLesson("assignment", 3),
      contentLesson("next", 4),
      quizLesson("next-quiz", "next", 5),
    ]);
    input.states.set("content", { lessonId: "content", isComplete: true, isUnlocked: true });
    input.states.set("quiz", { lessonId: "quiz", isComplete: true, isUnlocked: true });
    input.states.set("next", { lessonId: "next", isComplete: false, isUnlocked: false });
    input.states.set("next-quiz", { lessonId: "next-quiz", isComplete: false, isUnlocked: false });
    input.assignmentSubmissions.set("assignment", "needs_revision");

    const result = buildLearnerCourseOutline(input);
    expect(result.ok && result.outline.tiles[1].state).toBe("needs_revision");
    expect(result.ok && result.outline.tiles[2].state).toBe("locked");
    expect(result.ok && result.outline.resume?.href).toBe("/lessons/assignment");
  });
});
