import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  states: vi.fn(),
}));

vi.mock("./lesson-state-rpc", () => ({
  loadLearnerLessonStates: mocks.states,
}));

import { loadLearnerLessonOutline } from "./load-learner-lesson-outline";

type QueryCall = {
  table: string;
  filters: Array<[string, unknown]>;
  inFilters: Array<[string, unknown[]]>;
  limits: number[];
};

const lessons = [
  rawLesson({ id: "content-1", lesson_type: "content" }),
  rawLesson({
    id: "quiz-1",
    lesson_type: "quiz",
    prerequisite_lesson_id: "content-1",
    quiz_id: "quiz-record-1",
  }),
  rawLesson({
    id: "assignment-1",
    lesson_type: "assignment",
    assignment_id: "assignment-record-1",
  }),
];

describe("loadLearnerLessonOutline", () => {
  beforeEach(() => {
    mocks.states.mockReset();
    mocks.states.mockResolvedValue({
      ok: true,
      states: new Map(lessons.map((lesson) => [
        lesson.id,
        { lessonId: lesson.id, isComplete: false, isUnlocked: true },
      ])),
    });
  });

  it("hydrates only the requested content lesson and its block progress", async () => {
    const { supabase, calls } = fakeSupabase();
    const result = await loadLearnerLessonOutline({
      supabase: supabase as never,
      courseId: "course-1",
      lessonId: "content-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const content = result.outline.tiles.find((tile) => tile.id === "content-1");
    const assignment = result.outline.tiles.find((tile) => tile.id === "assignment-1");
    expect(content?.blocks.map((block) => block.id)).toEqual(["block-current"]);
    expect(assignment?.blocks).toEqual([]);
    expect(calls.map((call) => call.table)).toEqual([
      "courses",
      "content_blocks",
      "user_block_progress",
    ]);
    expect(calls.find((call) => call.table === "content_blocks")?.filters).toContainEqual([
      "lesson_id",
      "content-1",
    ]);
    expect(calls.find((call) => call.table === "user_block_progress")?.inFilters).toEqual([
      ["block_id", ["block-current"]],
    ]);
  });

  it("queries assignment status only when the requested lesson is an assignment", async () => {
    const { supabase, calls } = fakeSupabase();
    await loadLearnerLessonOutline({
      supabase: supabase as never,
      courseId: "course-1",
      lessonId: "assignment-1",
      userId: "user-1",
    });

    const assignment = calls.find((call) => call.table === "assignment_submissions");
    expect(assignment?.filters).toEqual([
      ["user_id", "user-1"],
      ["lesson_id", "assignment-1"],
    ]);
    expect(assignment?.limits).toEqual([1]);
  });
});

function fakeSupabase() {
  const calls: QueryCall[] = [];
  const supabase = {
    from(table: string) {
      const call: QueryCall = { table, filters: [], inFilters: [], limits: [] };
      calls.push(call);
      const result = resultFor(table);
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) {
          call.filters.push([column, value]);
          return query;
        },
        in(column: string, values: unknown[]) {
          call.inFilters.push([column, values]);
          return query;
        },
        order() { return query; },
        limit(value: number) {
          call.limits.push(value);
          return query;
        },
        maybeSingle: async () => result,
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: typeof result) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve(result).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };
  return { supabase, calls };
}

function resultFor(table: string) {
  if (table === "courses") {
    return {
      data: {
        id: "course-1",
        title: "Course",
        description: null,
        is_published: true,
        thumbnail_path: null,
        content_import_id: null,
        thumbnail_asset_key: null,
        thumbnail_approved_path: null,
        thumbnail_approved_sha256: null,
        modules: [{
          id: "module-1",
          title: "Module",
          description: null,
          sort_order: 1,
          lessons,
        }],
      },
      error: null,
    };
  }
  if (table === "content_blocks") {
    return {
      data: [{
        id: "block-current",
        block_type: "text",
        content: { html: "<p>Current</p>" },
        sort_order: 1,
        is_required_for_completion: false,
      }],
      error: null,
    };
  }
  if (table === "assignment_submissions") {
    return {
      data: [{
        id: "submission-1",
        lesson_id: "assignment-1",
        status: "submitted",
        submitted_at: "2026-07-22T00:00:00.000Z",
      }],
      error: null,
    };
  }
  return { data: [], error: null };
}

function rawLesson(overrides: Partial<Record<string, unknown>>) {
  return {
    id: "lesson",
    title: "Lesson",
    description: null,
    lesson_type: "content",
    sort_order: 1,
    prerequisite_lesson_id: null,
    quiz_id: null,
    assignment_id: null,
    is_required_for_completion: true,
    thumbnail_path: null,
    content_import_id: null,
    thumbnail_asset_key: null,
    thumbnail_approved_path: null,
    thumbnail_approved_sha256: null,
    ...overrides,
  } as {
    id: string;
    title: string;
    description: null;
    lesson_type: string;
    sort_order: number;
    prerequisite_lesson_id: string | null;
    quiz_id: string | null;
    assignment_id: string | null;
    is_required_for_completion: boolean;
    thumbnail_path: null;
    content_import_id: null;
    thumbnail_asset_key: null;
    thumbnail_approved_path: null;
    thumbnail_approved_sha256: null;
  };
}
