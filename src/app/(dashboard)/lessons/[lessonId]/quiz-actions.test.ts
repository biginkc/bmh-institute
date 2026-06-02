// HARDEN-04: regression that submitQuizAttempt acquires createAdminClient
// for the questions/answer_options scoring fetch (per D-10). Eligibility
// queries continue to run against the learner client.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const learnerFromCalls: string[] = [];
const adminFromCalls: string[] = [];
let questionsRows: Array<{
  id: string;
  question_type: string;
  points: number;
  sort_order: number;
  answer_options: Array<{ id: string; is_correct: boolean }>;
}> = [];
const attemptInsertSpy = vi.fn(async (rows?: unknown) => {
  void rows;
  return { data: null, error: null };
});
let adminFactoryThrows: Error | null = null;
let lastInsertedAttempt: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "learner-1", email: "l@b.com" } },
        error: null,
      }),
    },
    from: (table: string) => {
      learnerFromCalls.push(table);
      if (table === "quizzes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "quiz-1",
                  passing_score: 80,
                  max_attempts: 3,
                  retake_cooldown_hours: 0,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user_quiz_attempts") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                then: (
                  r: (v: { data: unknown[]; error: null }) => unknown,
                ) =>
                  Promise.resolve({ data: [], error: null }).then(r),
              }),
            }),
          }),
          insert: (rows: Record<string, unknown>) => {
            lastInsertedAttempt = rows;
            attemptInsertSpy(rows);
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "attempt-1" },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      throw new Error(`Unexpected learner-client table: ${table}`);
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    if (adminFactoryThrows) throw adminFactoryThrows;
    return {
      from: (table: string) => {
        adminFromCalls.push(table);
        if (table === "questions") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({ data: questionsRows, error: null }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected admin-client table: ${table}`);
      },
    };
  }),
}));

import { submitQuizAttempt } from "./quiz-actions";

describe("submitQuizAttempt (HARDEN-04 admin-client scoring fetch)", () => {
  beforeEach(() => {
    learnerFromCalls.length = 0;
    adminFromCalls.length = 0;
    adminFactoryThrows = null;
    lastInsertedAttempt = null;
    attemptInsertSpy.mockReset();
    attemptInsertSpy.mockResolvedValue({ data: null, error: null });
    questionsRows = [
      {
        id: "q-1",
        question_type: "single_choice",
        points: 10,
        sort_order: 1,
        answer_options: [
          { id: "a-1", is_correct: true },
          { id: "a-2", is_correct: false },
        ],
      },
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("acquires createAdminClient before fetching questions for scoring", async () => {
    const result = await submitQuizAttempt({
      quizId: "quiz-1",
      lessonId: "lesson-1",
      responses: { "q-1": ["a-1"] },
    });
    expect(result).toMatchObject({ ok: true });
    expect(adminFromCalls).toContain("questions");
    expect(learnerFromCalls).not.toContain("questions");
  });

  it("returns the admin-client error when env vars are missing", async () => {
    adminFactoryThrows = new Error(
      "Admin Supabase client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
    const result = await submitQuizAttempt({
      quizId: "quiz-1",
      lessonId: "lesson-1",
      responses: { "q-1": ["a-1"] },
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toContain(
      "Admin Supabase client requires",
    );
    expect(adminFromCalls).not.toContain("questions");
  });

  it("preserves the existing scoring contract: a fully-correct submission scores 100%", async () => {
    const result = await submitQuizAttempt({
      quizId: "quiz-1",
      lessonId: "lesson-1",
      responses: { "q-1": ["a-1"] },
    });
    expect(result).toMatchObject({ ok: true });
    expect(lastInsertedAttempt?.score).toBe(100);
  });
});
