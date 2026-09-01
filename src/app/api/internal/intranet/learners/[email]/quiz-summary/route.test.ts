import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ rpc: mocks.rpc })),
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

function summaryRow(
  overrides: Partial<{
    attempts: number;
    best_final_quiz_score: number | null;
    catalog_valid: boolean;
    email: string | null;
    last_attempt_at: string | null;
    profile_match_count: number;
  }> = {},
) {
  return {
    attempts: 0,
    best_final_quiz_score: null,
    catalog_valid: true,
    email,
    last_attempt_at: null,
    profile_match_count: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("INTRANET_SERVICE_TOKEN", serviceToken);
  mocks.rpc.mockResolvedValue({ data: [summaryRow()], error: null });
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
    vi.stubEnv("INTRANET_SERVICE_TOKEN", placeholderToken);
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
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns 404 when the learner email is unknown", async () => {
    mocks.rpc.mockResolvedValue({
      data: [summaryRow({ email: null, profile_match_count: 0 })],
      error: null,
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "learner not found" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("fails closed when the profile or catalog identity is ambiguous", async () => {
    for (const row of [
      summaryRow({ profile_match_count: 2 }),
      summaryRow({ catalog_valid: false }),
    ]) {
      mocks.rpc.mockResolvedValueOnce({ data: [row], error: null });
      const response = await GET(request(), context());
      await expectUnavailable(response);
    }
  });

  it("returns the exact empty summary from the one-snapshot RPC", async () => {
    const response = await GET(request(), context("LEARNER@EXAMPLE.TEST"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      email,
      bestFinalQuizScore: null,
      passed85: false,
      attempts: 0,
      lastAttemptAt: null,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "fn_intranet_learner_quiz_summary_v1",
      {
        p_email: email,
        p_course_import_id: "bmh-employee-training-v1",
      },
    );
  });

  it("returns the best score, exact attempt count, and latest completion", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        summaryRow({
          attempts: 3,
          best_final_quiz_score: 91,
          last_attempt_at: "2026-08-30T12:00:00.000Z",
        }),
      ],
      error: null,
    });

    const response = await GET(request(), context());

    expect(await response.json()).toEqual({
      email,
      bestFinalQuizScore: 91,
      passed85: true,
      attempts: 3,
      lastAttemptAt: "2026-08-30T12:00:00.000Z",
    });
  });

  it("counts completed unscored attempts without treating them as passing", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        summaryRow({
          attempts: 2,
          last_attempt_at: "2026-08-30T12:00:00.000Z",
        }),
      ],
      error: null,
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
    mocks.rpc.mockResolvedValue({
      data: [
        summaryRow({
          attempts: 1,
          best_final_quiz_score: score,
          last_attempt_at: "2026-08-30T12:00:00.000Z",
        }),
      ],
      error: null,
    });

    const response = await GET(request(), context());

    expect((await response.json()).passed85).toBe(passed85);
  });

  it("fails closed on inconsistent or unavailable database summaries", async () => {
    const results = [
      { data: null, error: { message: "sensitive database detail" } },
      { data: [], error: null },
      {
        data: [summaryRow({ attempts: 1, last_attempt_at: null })],
        error: null,
      },
    ];

    for (const result of results) {
      mocks.rpc.mockResolvedValueOnce(result);
      const response = await GET(request(), context());
      await expectUnavailable(response);
    }
  });
});
