import { describe, expect, it, vi } from "vitest";

import {
  loadAdminLessonCompletions,
  loadLearnerLessonStates,
} from "./lesson-state-rpc";

describe("lesson state batch RPC readers", () => {
  it("uses one learner RPC for dozens of lessons", async () => {
    const lessonIds = Array.from({ length: 48 }, (_, index) => `lesson-${index}`);
    const rpc = vi.fn(async () => ({
      data: lessonIds.map((lessonId) => ({
        lesson_id: lessonId,
        is_complete: true,
        is_unlocked: true,
      })),
      error: null,
    }));

    const result = await loadLearnerLessonStates({ rpc } as never, {
      userId: "learner-1",
      lessonIds,
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a learner RPC omits a requested lesson", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ lesson_id: "lesson-1", is_complete: true, is_unlocked: true }],
      error: null,
    }));

    await expect(
      loadLearnerLessonStates({ rpc } as never, {
        userId: "learner-1",
        lessonIds: ["lesson-1", "lesson-2"],
      }),
    ).resolves.toEqual({ ok: false });
  });

  it("does not count a stale stored completion after its video asset is replaced", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          user_id: "learner-1",
          lesson_id: "video-lesson",
          is_complete: false,
          completed_at: null,
        },
      ],
      error: null,
    }));

    const result = await loadAdminLessonCompletions({ rpc } as never, {
      userIds: ["learner-1"],
      lessonIds: ["video-lesson"],
    });

    expect(result).toEqual({ ok: true, completions: [] });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fn_admin_lesson_completion_states", {
      p_user_ids: ["learner-1"],
      p_lesson_ids: ["video-lesson"],
    });
  });

  it("fails closed when an admin RPC omits a requested learner/lesson pair", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          user_id: "learner-1",
          lesson_id: "lesson-1",
          is_complete: true,
          completed_at: "2026-07-17T00:00:00.000Z",
        },
      ],
      error: null,
    }));

    await expect(
      loadAdminLessonCompletions({ rpc } as never, {
        userIds: ["learner-1", "learner-2"],
        lessonIds: ["lesson-1"],
      }),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed when the admin completion RPC returns an error", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "database unavailable" },
    }));

    await expect(
      loadAdminLessonCompletions({ rpc } as never, {
        userIds: ["learner-1"],
        lessonIds: ["lesson-1"],
      }),
    ).resolves.toEqual({ ok: false });
  });

  it("chunks large admin reports below the hosted Data API row limit", async () => {
    const userIds = Array.from({ length: 121 }, (_, index) => `user-${index}`);
    const lessonIds = Array.from({ length: 50 }, (_, index) => `lesson-${index}`);
    const rpc = vi.fn(
      async (
        _name: string,
        args: { p_user_ids: string[]; p_lesson_ids: string[] },
      ) => ({
        // Mirror hosted PostgREST's default response ceiling. A request over
        // 1,000 pairs is silently truncated rather than returned as an error.
        data: args.p_user_ids
          .flatMap((userId) =>
            args.p_lesson_ids.map((lessonId) => ({
              user_id: userId,
              lesson_id: lessonId,
              is_complete: false,
              completed_at: null,
            })),
          )
          .slice(0, 1_000),
        error: null,
      }),
    );

    await expect(
      loadAdminLessonCompletions({ rpc } as never, { userIds, lessonIds }),
    ).resolves.toEqual({ ok: true, completions: [] });
    expect(rpc).toHaveBeenCalledTimes(7);
    expect(
      rpc.mock.calls.some(
        ([, args]) => args.p_user_ids.length * args.p_lesson_ids.length === 1_000,
      ),
    ).toBe(true);
    for (const [, args] of rpc.mock.calls) {
      expect(args.p_user_ids.length * args.p_lesson_ids.length).toBeLessThanOrEqual(
        1_000,
      );
    }
  });
});
