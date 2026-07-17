import { describe, expect, it, vi } from "vitest";

import { loadContentLessonNavigation } from "./page";

function navigationClient(input?: { rpcError?: { message: string } }) {
  const lessons = Array.from({ length: 48 }, (_, index) => ({
    id: `lesson-${index + 1}`,
    title: `Lesson ${index + 1}`,
    lesson_type: "content",
    sort_order: index,
    prerequisite_lesson_id: index === 0 ? null : `lesson-${index}`,
  }));
  const rpc = vi.fn(async (_name: string, args: { p_lesson_ids: string[] }) => ({
    data: input?.rpcError
      ? null
      : args.p_lesson_ids.map((lessonId, index) => ({
          lesson_id: lessonId,
          is_complete: index < 5,
          is_unlocked: index < 6,
        })),
    error: input?.rpcError ?? null,
  }));
  const modules = [{ id: "module-1", sort_order: 0, lessons }];
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: async () => ({ data: modules, error: null }),
  };
  return {
    lessons,
    rpc,
    client: { from: () => chain, rpc },
  };
}

describe("content lesson navigation state", () => {
  it("loads dozens of completion and unlock states with one RPC call", async () => {
    const { client, lessons, rpc } = navigationClient();

    const result = await loadContentLessonNavigation({
      supabase: client as never,
      courseId: "course-1",
      lessonId: "lesson-6",
      userId: "learner-1",
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fn_lesson_states", {
      p_user_id: "learner-1",
      p_lesson_ids: lessons.map((lesson) => lesson.id),
    });
  });

  it("fails the whole navigation read when the batch RPC fails", async () => {
    const { client, rpc } = navigationClient({
      rpcError: { message: "database unavailable" },
    });

    await expect(
      loadContentLessonNavigation({
        supabase: client as never,
        courseId: "course-1",
        lessonId: "lesson-6",
        userId: "learner-1",
      }),
    ).resolves.toEqual({ ok: false });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
