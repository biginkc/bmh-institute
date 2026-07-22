import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { GET } from "./route";

describe("authenticated lesson search route", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
  });

  it("returns short queries without creating a database client", async () => {
    const response = await GET(request("a"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results: [] });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("verifies the user before issuing a lesson query", async () => {
    const from = vi.fn();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      from,
    });

    const response = await GET(request("opening"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(from).not.toHaveBeenCalled();
  });

  it("bounds and escapes a query, then maps a visible quiz to its composite parent", async () => {
    const queries: QueryRecord[] = [];
    mocks.createClient.mockResolvedValue(
      fakeClient(queries, [
        {
          data: [
            {
              id: "lesson-1",
              title: "100% Opening",
              lesson_type: "content",
              module_id: "module-1",
              prerequisite_lesson_id: null,
              quiz_id: null,
              modules: { course_id: "course-1" },
            },
            {
              id: "quiz-1",
              title: "100% Opening quiz",
              lesson_type: "quiz",
              module_id: "module-1",
              prerequisite_lesson_id: "lesson-1",
              quiz_id: "quiz-record-1",
              modules: { course_id: "course-1" },
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: "lesson-1",
              lesson_type: "content",
              module_id: "module-1",
              modules: { course_id: "course-1" },
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: "quiz-1",
              lesson_type: "quiz",
              module_id: "module-1",
              prerequisite_lesson_id: "lesson-1",
              quiz_id: "quiz-record-1",
            },
          ],
          error: null,
        },
      ]),
    );

    const response = await GET(request(`${"100%_"}${"x".repeat(100)}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        { id: "lesson-1", title: "100% Opening", href: "/lessons/lesson-1" },
        {
          id: "quiz-1",
          title: "100% Opening quiz",
          href: "/lessons/lesson-1?part=quiz",
        },
      ],
    });
    expect(queries[0]?.pattern).toHaveLength(84);
    expect(queries[0]?.pattern).toBe(`%100\\%\\_${"x".repeat(75)}%`);
    expect(queries[0]?.limit).toBe(8);
    expect(queries[1]?.inFilter).toEqual(["id", ["lesson-1"]]);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not emit a quiz parent destination unless RLS exposes that parent", async () => {
    const queries: QueryRecord[] = [];
    mocks.createClient.mockResolvedValue(
      fakeClient(queries, [
        {
          data: [
            {
              id: "quiz-1",
              title: "Private parent quiz",
              lesson_type: "quiz",
              module_id: "module-1",
              prerequisite_lesson_id: "private-parent",
              quiz_id: "quiz-record-1",
              modules: { course_id: "course-1" },
            },
          ],
          error: null,
        },
        { data: [], error: null },
        {
          data: [
            {
              id: "quiz-1",
              lesson_type: "quiz",
              module_id: "module-1",
              prerequisite_lesson_id: "private-parent",
              quiz_id: "quiz-record-1",
            },
          ],
          error: null,
        },
      ]),
    );

    const response = await GET(request("private"));

    await expect(response.json()).resolves.toEqual({
      results: [
        { id: "quiz-1", title: "Private parent quiz", href: "/lessons/quiz-1" },
      ],
    });
  });

  it("does not map a malformed cross-course quiz to another course's lesson", async () => {
    mocks.createClient.mockResolvedValue(
      fakeClient(
        [],
        [
          {
            data: [
              {
                id: "quiz-1",
                title: "Cross-course quiz",
                lesson_type: "quiz",
                module_id: "module-1",
                prerequisite_lesson_id: "lesson-2",
                quiz_id: "quiz-record-1",
                modules: { course_id: "course-1" },
              },
            ],
            error: null,
          },
          {
            data: [
              {
                id: "lesson-2",
                lesson_type: "content",
                module_id: "module-2",
                modules: { course_id: "course-2" },
              },
            ],
            error: null,
          },
          {
            data: [
              {
                id: "quiz-1",
                lesson_type: "quiz",
                module_id: "module-1",
                prerequisite_lesson_id: "lesson-2",
                quiz_id: "quiz-record-1",
              },
            ],
            error: null,
          },
        ],
      ),
    );

    const response = await GET(request("cross-course"));

    await expect(response.json()).resolves.toEqual({
      results: [
        { id: "quiz-1", title: "Cross-course quiz", href: "/lessons/quiz-1" },
      ],
    });
  });

  it("keeps standalone and ambiguous hand-authored quizzes searchable", async () => {
    mocks.createClient.mockResolvedValue(
      fakeClient(
        [],
        [
          {
            data: [
              {
                id: "quiz-standalone",
                title: "Standalone quiz",
                lesson_type: "quiz",
                module_id: "module-1",
                prerequisite_lesson_id: null,
                quiz_id: "quiz-record-standalone",
                modules: { course_id: "course-1" },
              },
              {
                id: "quiz-a",
                title: "Shared quiz A",
                lesson_type: "quiz",
                module_id: "module-1",
                prerequisite_lesson_id: "content-1",
                quiz_id: "quiz-record-a",
                modules: { course_id: "course-1" },
              },
            ],
            error: null,
          },
          {
            data: [
              {
                id: "content-1",
                lesson_type: "content",
                module_id: "module-1",
                modules: { course_id: "course-1" },
              },
            ],
            error: null,
          },
          {
            data: [
              {
                id: "quiz-a",
                lesson_type: "quiz",
                module_id: "module-1",
                prerequisite_lesson_id: "content-1",
                quiz_id: "quiz-record-a",
              },
              {
                id: "quiz-b",
                lesson_type: "quiz",
                module_id: "module-1",
                prerequisite_lesson_id: "content-1",
                quiz_id: "quiz-record-b",
              },
            ],
            error: null,
          },
        ],
      ),
    );

    const response = await GET(request("quiz"));

    await expect(response.json()).resolves.toEqual({
      results: [
        {
          id: "quiz-standalone",
          title: "Standalone quiz",
          href: "/lessons/quiz-standalone",
        },
        { id: "quiz-a", title: "Shared quiz A", href: "/lessons/quiz-a" },
      ],
    });
  });

  it("returns a private error response when the lesson query fails", async () => {
    mocks.createClient.mockResolvedValue(
      fakeClient(
        [],
        [{ data: null, error: { message: "database unavailable" } }],
      ),
    );

    const response = await GET(request("opening"));

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ results: [] });
  });
});

type QueryResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};
type QueryRecord = {
  table: string;
  pattern?: string;
  limit?: number;
  inFilter?: [string, unknown[]];
};

function request(query: string) {
  return new Request(
    `https://institute.test/api/lesson-search?q=${encodeURIComponent(query)}`,
  );
}

function fakeClient(records: QueryRecord[], results: QueryResult[]) {
  let resultIndex = 0;
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from(table: string) {
      const record: QueryRecord = { table };
      records.push(record);
      const result = results[resultIndex++] ?? { data: [], error: null };
      const chain = {
        select() {
          return chain;
        },
        ilike(_column: string, pattern: string) {
          record.pattern = pattern;
          return chain;
        },
        order() {
          return chain;
        },
        limit(value: number) {
          record.limit = value;
          return chain;
        },
        in(column: string, values: unknown[]) {
          record.inFilter = [column, values];
          return chain;
        },
        eq() {
          return chain;
        },
        then<TResult1 = QueryResult, TResult2 = never>(
          onfulfilled?:
            ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?:
            ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve(result).then(onfulfilled, onrejected);
        },
      };
      return chain;
    },
  };
}
