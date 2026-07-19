// Answer option create and update use authenticated atomic RPCs. The database
// proves lesson ownership and the private import reviewer boundary.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const learnerFromCalls: string[] = [];
const adminFromCalls: string[] = [];
const authenticatedRpcCalls: Array<{
  name: string;
  args: Record<string, unknown>;
}> = [];
let authenticatedRpcError: { message: string } | null = null;
let adminFactoryThrows: Error | null = null;
let createdQuestionId = "question-1";
let lastOptionSortOrder: number | null = 4;
let lessonContentImportId: string | null = null;
let courseContentImportId: string | null = null;
let insertedAnswerOptions: unknown[] = [];
let updateCalls: Array<{
  patch: Record<string, unknown>;
  method: "eq" | "in";
  value: unknown;
}> = [];

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => {
    calls.push("requireAdmin");
    return { id: "admin-1", email: "admin@bmh.test", system_role: "owner" };
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      authenticatedRpcCalls.push({ name, args });
      return { data: authenticatedRpcError ? null : true, error: authenticatedRpcError };
    },
    from: (table: string) => {
      learnerFromCalls.push(table);
      if (table !== "questions") {
        throw new Error(`Unexpected learner-client table: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: { sort_order: 2 },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: { id: createdQuestionId },
              error: null,
            }),
          }),
        }),
      };
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    if (adminFactoryThrows) throw adminFactoryThrows;
    return {
      from: (table: string) => {
        adminFromCalls.push(table);
        return {
          select: (columns: string) => ({
            eq: () => ({
              maybeSingle: async () => {
                const rows: Record<string, Record<string, unknown>> = {
                  answer_options: { question_id: "question-1" },
                  lessons: {
                    quiz_id: "quiz-1",
                    module_id: "module-1",
                    content_import_id: lessonContentImportId,
                  },
                  questions: { quiz_id: "quiz-1" },
                  modules: { course_id: "course-1" },
                  courses: { content_import_id: courseContentImportId },
                };
                return { data: rows[table] ?? null, error: null };
              },
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data:
                      columns !== "sort_order" || lastOptionSortOrder === null
                        ? null
                        : { sort_order: lastOptionSortOrder },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          insert: async (rows: unknown) => {
            insertedAnswerOptions = Array.isArray(rows) ? rows : [rows];
            return { error: null };
          },
          update: (patch: Record<string, unknown>) => ({
            in: async (_column: string, value: unknown) => {
              updateCalls.push({ patch, method: "in", value });
              return { error: null };
            },
            eq: async (_column: string, value: unknown) => {
              updateCalls.push({ patch, method: "eq", value });
              return { error: null };
            },
          }),
          delete: () => ({
            eq: async (_column: string, value: unknown) => {
              calls.push(`delete:${String(value)}`);
              return { error: null };
            },
          }),
        };
      },
    };
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createAnswerOption,
  createQuestion,
  deleteAnswerOption,
  updateAnswerOption,
} from "./quiz-actions";

describe("admin quiz answer option actions", () => {
  beforeEach(() => {
    calls.length = 0;
    learnerFromCalls.length = 0;
    adminFromCalls.length = 0;
    adminFactoryThrows = null;
    createdQuestionId = "question-1";
    lastOptionSortOrder = 4;
    lessonContentImportId = null;
    courseContentImportId = null;
    insertedAnswerOptions = [];
    updateCalls = [];
    authenticatedRpcCalls.length = 0;
    authenticatedRpcError = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates answer options through one authenticated atomic RPC", async () => {
    const result = await createAnswerOption({
      questionId: "question-1",
      lessonId: "lesson-1",
      text: "  New option  ",
    });

    expect(result).toEqual({ ok: true });
    expect(adminFromCalls).toEqual([]);
    expect(learnerFromCalls).not.toContain("answer_options");
    expect(authenticatedRpcCalls).toEqual([{
      name: "fn_create_answer_option_for_reviewer_v1",
      args: {
        p_lesson_id: "lesson-1",
        p_question_id: "question-1",
        p_option_text: "New option",
      },
    }]);
  });

  it("seeds true false answer options through the admin client", async () => {
    const result = await createQuestion({
      quizId: "quiz-1",
      lessonId: "lesson-1",
      type: "true_false",
    });

    expect(result).toEqual({ ok: true });
    expect(adminFromCalls).toContain("answer_options");
    expect(learnerFromCalls).toContain("questions");
    expect(insertedAnswerOptions).toHaveLength(2);
    expect(insertedAnswerOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          question_id: createdQuestionId,
          option_text: "True",
          is_correct: false,
        }),
        expect.objectContaining({
          question_id: createdQuestionId,
          option_text: "False",
          is_correct: false,
        }),
      ]),
    );
  });

  it("updates answer correctness through one authenticated atomic RPC", async () => {
    const result = await updateAnswerOption({
      optionId: "option-1",
      lessonId: "lesson-1",
      text: " Correct option ",
      is_correct: true,
      exclusivePeerOptionIds: ["option-2"],
    });

    expect(result).toEqual({ ok: true });
    expect(adminFromCalls).toEqual([]);
    expect(learnerFromCalls).not.toContain("answer_options");
    expect(updateCalls).toEqual([]);
    expect(authenticatedRpcCalls).toEqual([
      {
        name: "fn_update_answer_option_for_reviewer_v1",
        args: {
          p_lesson_id: "lesson-1",
          p_option_id: "option-1",
          p_option_text: "Correct option",
          p_is_correct: true,
          p_exclusive_peer_option_ids: ["option-2"],
        },
      },
    ]);
  });

  it("surfaces a denied private-import answer option update", async () => {
    authenticatedRpcError = {
      message: "Admin reviewer access required for this imported answer option.",
    };

    const result = await updateAnswerOption({
      optionId: "private-option",
      lessonId: "private-lesson",
      text: "Attempted edit",
      is_correct: false,
    });

    expect(result).toEqual({
      ok: false,
      error: "Admin reviewer access required for this imported answer option.",
    });
    expect(adminFromCalls).toEqual([]);
  });

  it("deletes answer options through the admin client", async () => {
    const result = await deleteAnswerOption({
      optionId: "option-1",
      lessonId: "lesson-1",
    });

    expect(result).toEqual({ ok: true });
    expect(adminFromCalls).toEqual([
      "answer_options",
      "lessons",
      "questions",
      "modules",
      "courses",
      "answer_options",
    ]);
    expect(learnerFromCalls).not.toContain("answer_options");
    expect(calls).toContain("delete:option-1");
  });

  it("refuses to delete an answer option owned by an imported course", async () => {
    courseContentImportId = "bmh-institute-v1";

    const result = await deleteAnswerOption({
      optionId: "option-1",
      lessonId: "lesson-1",
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Imported course content can only be deleted with the exact course-import rollback operation.",
    });
    expect(calls).not.toContain("delete:option-1");
  });

  it("surfaces a denied private-import answer option create", async () => {
    authenticatedRpcError = {
      message: "Admin reviewer access required for this imported question.",
    };

    const result = await createAnswerOption({
      questionId: "question-1",
      lessonId: "lesson-1",
      text: "New option",
    });

    expect(result).toEqual({
      ok: false,
      error: "Admin reviewer access required for this imported question.",
    });
    expect(adminFromCalls).toEqual([]);
    expect(learnerFromCalls).not.toContain("answer_options");
  });
});
