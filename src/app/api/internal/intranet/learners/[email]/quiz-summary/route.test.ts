import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  profileLimit: vi.fn(),
  quizLessonsEqPublished: vi.fn(),
  attemptCountLimit: vi.fn(),
  bestAttemptMaybeSingle: vi.fn(),
  lastAttemptMaybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}));

import { GET } from "./route";

const email = "learner@example.test";
const serviceToken = "0123456789abcdef0123456789abcdef";

function request(token = serviceToken) {
  return new Request(
    `https://institute.example.test/api/internal/intranet/learners/${encodeURIComponent(email)}/quiz-summary`,
    { headers: { authorization: `Bearer ${token}` } },
  );
}

function context(value = email) {
  return { params: Promise.resolve({ email: value }) };
}

async function expectUnavailable(response: Response) {
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "quiz summary unavailable" });
}

function installQueries({
  profiles = [{ id: "learner-id", email }],
  quizLessons = [
    {
      id: "earlier-lesson-id",
      quiz_id: "earlier-quiz-id",
      sort_order: 2,
      is_required_for_completion: true,
      modules: {
        sort_order: 5,
        courses: {
          id: "course-id",
          content_import_id: "bmh-employee-training-v1",
          is_published: true,
        },
      },
    },
    {
      id: "final-lesson-id",
      quiz_id: "final-quiz-id",
      sort_order: 8,
      is_required_for_completion: true,
      modules: {
        sort_order: 6,
        courses: {
          id: "course-id",
          content_import_id: "bmh-employee-training-v1",
          is_published: true,
        },
      },
    },
    {
      id: "unrelated-lesson-id",
      quiz_id: "unrelated-quiz-id",
      sort_order: 99,
      is_required_for_completion: true,
      modules: {
        sort_order: 99,
        courses: {
          id: "unrelated-course-id",
          content_import_id: "unrelated-training-v1",
          is_published: true,
        },
      },
    },
  ],
  attemptCount = 0,
  bestScore = null,
  lastAttemptAt = null,
  profileError = null,
  quizLessonsError = null,
  attemptsError = null,
}: {
  profiles?: Array<{ id: string; email: string }>;
  quizLessons?: Array<{
    id: string;
    quiz_id: string | null;
    sort_order: number;
    is_required_for_completion: boolean;
    modules:
      | {
          sort_order: number;
          courses: {
            id: string;
            content_import_id: string | null;
            is_published: boolean;
          };
        }
      | Array<{
          sort_order: number;
          courses: Array<{
            id: string;
            content_import_id: string | null;
            is_published: boolean;
          }>;
        }>;
  }>;
  attemptCount?: number;
  bestScore?: number | null;
  lastAttemptAt?: string | null;
  profileError?: { message: string } | null;
  quizLessonsError?: { message: string } | null;
  attemptsError?: { message: string } | null;
} = {}) {
  const profileQuery = {
    select: vi.fn(),
    ilike: vi.fn(),
    limit: vi.fn(),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.ilike.mockReturnValue(profileQuery);
  profileQuery.limit.mockImplementation((limit: number) =>
    limit === 2 ? mocks.profileLimit(limit) : profileQuery,
  );
  mocks.profileLimit.mockResolvedValue({
    data: profiles,
    error: profileError,
  });
  const quizLessonsQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
  };
  quizLessonsQuery.select.mockReturnValue(quizLessonsQuery);
  quizLessonsQuery.eq
    .mockReturnValueOnce(quizLessonsQuery)
    .mockReturnValueOnce(quizLessonsQuery)
    .mockReturnValueOnce(quizLessonsQuery)
    .mockImplementationOnce(mocks.quizLessonsEqPublished);
  quizLessonsQuery.not.mockReturnValue(quizLessonsQuery);
  mocks.quizLessonsEqPublished.mockResolvedValue({
    data: quizLessons,
    error: quizLessonsError,
  });

  const attemptCountQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    limit: mocks.attemptCountLimit,
  };
  attemptCountQuery.select.mockReturnValue(attemptCountQuery);
  attemptCountQuery.eq.mockReturnValue(attemptCountQuery);
  attemptCountQuery.not.mockReturnValue(attemptCountQuery);
  mocks.attemptCountLimit.mockResolvedValue({
    data: null,
    count: attemptCount,
    error: attemptsError,
  });

  function singleAttemptQuery(
    maybeSingle: typeof mocks.bestAttemptMaybeSingle,
    data: object | null,
  ) {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      not: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle,
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.not.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    maybeSingle.mockResolvedValue({ data, error: attemptsError });
    return query;
  }

  const bestAttemptQuery = singleAttemptQuery(
    mocks.bestAttemptMaybeSingle,
    bestScore === null ? null : { score: bestScore },
  );
  const lastAttemptQuery = singleAttemptQuery(
    mocks.lastAttemptMaybeSingle,
    lastAttemptAt === null ? null : { completed_at: lastAttemptAt },
  );

  let attemptQueryIndex = 0;
  const attemptQueries = [
    attemptCountQuery,
    bestAttemptQuery,
    lastAttemptQuery,
  ];

  mocks.from.mockImplementation((table: string) => {
    if (table === "profiles") return profileQuery;
    if (table === "lessons") return quizLessonsQuery;
    if (table === "user_quiz_attempts") {
      return attemptQueries[attemptQueryIndex++];
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    profileQuery,
    quizLessonsQuery,
    attemptCountQuery,
    bestAttemptQuery,
    lastAttemptQuery,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("INTRANET_SERVICE_TOKEN", serviceToken);
  installQueries();
});

describe("GET internal learner quiz summary", () => {
  it("rejects invalid authorization and unsafe server token configuration before database access", async () => {
    const missing = await GET(new Request(request().url), context());
    const malformed = await GET(
      new Request(request().url, {
        headers: { authorization: `Basic ${serviceToken}` },
      }),
      context(),
    );
    const incorrect = await GET(request("incorrect-token"), context());
    vi.stubEnv("INTRANET_SERVICE_TOKEN", "");
    const unset = await GET(request(), context());
    vi.stubEnv("INTRANET_SERVICE_TOKEN", "   ");
    const whitespace = await GET(request("   "), context());
    const placeholderToken =
      "replace_with_long_random_intranet_service_token";
    vi.stubEnv(
      "INTRANET_SERVICE_TOKEN",
      placeholderToken,
    );
    const placeholder = await GET(request(placeholderToken), context());
    vi.stubEnv("INTRANET_SERVICE_TOKEN", "short-token");
    const short = await GET(request("short-token"), context());

    expect([
      missing.status,
      malformed.status,
      incorrect.status,
      unset.status,
      whitespace.status,
      placeholder.status,
      short.status,
    ]).toEqual([401, 401, 401, 401, 401, 401, 401]);
    expect(await missing.json()).toEqual({ error: "unauthorized" });
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns the same 404 contract when the learner email is unknown", async () => {
    installQueries({ profiles: [] });

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "learner not found" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.quizLessonsEqPublished).not.toHaveBeenCalled();
    expect(mocks.attemptCountLimit).not.toHaveBeenCalled();
  });

  it("fails closed when multiple profiles share the requested email", async () => {
    installQueries({
      profiles: [
        { id: "learner-id", email },
        { id: "duplicate-id", email: email.toUpperCase() },
      ],
    });

    const response = await GET(request(), context());

    await expectUnavailable(response);
    expect(mocks.quizLessonsEqPublished).not.toHaveBeenCalled();
    expect(mocks.attemptCountLimit).not.toHaveBeenCalled();
  });

  it("returns the exact empty summary when the learner has not taken the final quiz", async () => {
    const {
      profileQuery,
      attemptCountQuery,
      bestAttemptQuery,
      lastAttemptQuery,
    } = installQueries();

    const response = await GET(request(), context("LEARNER@example.test"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      email,
      bestFinalQuizScore: null,
      passed85: false,
      attempts: 0,
      lastAttemptAt: null,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(profileQuery.ilike).toHaveBeenCalledWith("email", email);
    expect(attemptCountQuery.select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    for (const query of [attemptCountQuery, bestAttemptQuery, lastAttemptQuery]) {
      expect(query.eq).toHaveBeenCalledWith("user_id", "learner-id");
      expect(query.eq).toHaveBeenCalledWith("quiz_id", "final-quiz-id");
      expect(query.eq).toHaveBeenCalledWith("lesson_id", "final-lesson-id");
    }
    expect(attemptCountQuery.not).toHaveBeenCalledWith(
      "completed_at",
      "is",
      null,
    );
    expect(bestAttemptQuery.not).toHaveBeenCalledWith("score", "is", null);
    expect(bestAttemptQuery.order).toHaveBeenCalledWith("score", {
      ascending: false,
    });
    expect(lastAttemptQuery.order).toHaveBeenCalledWith("completed_at", {
      ascending: false,
    });
  });

  it("escapes wildcard characters in the case-insensitive email lookup", async () => {
    const { profileQuery } = installQueries();

    await GET(request(), context("A%_B@EXAMPLE.TEST"));

    expect(profileQuery.ilike).toHaveBeenCalledWith(
      "email",
      "a\\%\\_b@example.test",
    );
  });

  it("summarizes only completed attempts for the last published-course quiz", async () => {
    const { quizLessonsQuery } = installQueries({
      attemptCount: 3,
      bestScore: 91,
      lastAttemptAt: "2026-08-30T12:00:00.000Z",
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      email,
      bestFinalQuizScore: 91,
      passed85: true,
      attempts: 3,
      lastAttemptAt: "2026-08-30T12:00:00.000Z",
    });
    expect(quizLessonsQuery.eq).toHaveBeenNthCalledWith(
      1,
      "lesson_type",
      "quiz",
    );
    expect(quizLessonsQuery.not).toHaveBeenCalledWith("quiz_id", "is", null);
    expect(quizLessonsQuery.eq).toHaveBeenNthCalledWith(
      2,
      "is_required_for_completion",
      true,
    );
    expect(quizLessonsQuery.eq).toHaveBeenNthCalledWith(
      3,
      "modules.courses.is_published",
      true,
    );
    expect(quizLessonsQuery.eq).toHaveBeenNthCalledWith(
      4,
      "modules.courses.content_import_id",
      "bmh-employee-training-v1",
    );
  });

  it("counts completed unscored attempts without treating them as a passing score", async () => {
    installQueries({
      attemptCount: 2,
      bestScore: null,
      lastAttemptAt: "2026-08-30T12:00:00.000Z",
    });

    const response = await GET(request(), context());

    expect(await response.json()).toEqual({
      email,
      bestFinalQuizScore: null,
      passed85: false,
      attempts: 2,
      lastAttemptAt: "2026-08-30T12:00:00.000Z",
    });
  });

  it.each([
    { score: 84, passed85: false },
    { score: 85, passed85: true },
  ])("applies the inclusive 85 passing boundary for score $score", async ({
    score,
    passed85,
  }) => {
    installQueries({
      attemptCount: 1,
      bestScore: score,
      lastAttemptAt: "2026-08-30T12:00:00.000Z",
    });

    const response = await GET(request(), context());

    expect((await response.json()).passed85).toBe(passed85);
  });

  it("fails closed when the canonical course has an ambiguous final quiz order", async () => {
    installQueries({
      quizLessons: [
        {
          id: "quiz-lesson-a",
          quiz_id: "quiz-a",
          sort_order: 8,
          is_required_for_completion: true,
          modules: {
            sort_order: 6,
            courses: {
              id: "course-id",
              content_import_id: "bmh-employee-training-v1",
              is_published: true,
            },
          },
        },
        {
          id: "quiz-lesson-b",
          quiz_id: "quiz-b",
          sort_order: 8,
          is_required_for_completion: true,
          modules: {
            sort_order: 6,
            courses: {
              id: "course-id",
              content_import_id: "bmh-employee-training-v1",
              is_published: true,
            },
          },
        },
      ],
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(503);
    expect(mocks.attemptCountLimit).not.toHaveBeenCalled();
  });

  it("fails closed without exposing database errors", async () => {
    installQueries({ attemptsError: { message: "sensitive database detail" } });

    const response = await GET(request(), context());

    await expectUnavailable(response);
  });
});
