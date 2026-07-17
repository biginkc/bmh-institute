import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  buildSandraCourseCompletedRequest,
  reconcilePendingSandraCourseCompletions,
  reconcileSandraCourseCompleted,
  sendSandraCourseCompleted,
} from "./course-completed";

const INPUT = {
  userId: "user-123",
  courseId: "course-123",
  learnerEmail: "learner@example.test",
  learnerName: "Learner Example",
  courseTitle: "BMH V1 Course",
  completedAt: "2026-06-02T14:30:00.000Z",
  certificateNumber: "BMH-C-2026-0001",
  certificateUrl: "/certificates/cert-123",
};

const ENV = {
  NODE_ENV: "test",
  SANDRA_API_BASE_URL: "https://sandra.test/",
  SANDRA_SERVICE_TOKEN: "test-service-token",
  SANDRA_ORG_ID: "00000000-0000-0000-0000-000000000bbb",
  SANDRA_REQUEST_TIMEOUT_MS: "5",
} as NodeJS.ProcessEnv;

describe("buildSandraCourseCompletedRequest", () => {
  it("returns null when Sandra URL, token, or org id is missing", () => {
    expect(buildSandraCourseCompletedRequest(INPUT, { ...ENV, SANDRA_API_BASE_URL: "" })).toBeNull();
    expect(buildSandraCourseCompletedRequest(INPUT, { ...ENV, SANDRA_SERVICE_TOKEN: "" })).toBeNull();
    expect(buildSandraCourseCompletedRequest(INPUT, { ...ENV, SANDRA_ORG_ID: "" })).toBeNull();
  });

  it("builds a signed course.completed request without exposing the token in the body", () => {
    const request = buildSandraCourseCompletedRequest(INPUT, ENV);
    expect(request).not.toBeNull();
    expect(request?.url).toBe(
      "https://sandra.test/api/internal/bmh-institute/course-outcomes/by-course-completion/user-123%3Acourse-123",
    );
    expect(request?.headers).toMatchObject({
      authorization: "Bearer test-service-token",
      "content-type": "application/json",
      "idempotency-key": `bmh-institute-course:${INPUT.userId}:${INPUT.courseId}:${INPUT.completedAt}`,
    });

    const body = request!.body;
    expect(JSON.parse(body)).toMatchObject({
      org_id: ENV.SANDRA_ORG_ID,
      institute_user_id: INPUT.userId,
      course_id: INPUT.courseId,
      status: "completed",
      completed_at: INPUT.completedAt,
      certificate_number: INPUT.certificateNumber,
    });
    expect(body).not.toContain(ENV.SANDRA_SERVICE_TOKEN!);
    expect(request!.headers["x-sandra-signature"]).toBe(
      "sha256=" + createHmac("sha256", ENV.SANDRA_SERVICE_TOKEN!).update(body).digest("hex"),
    );
  });
});

describe("sendSandraCourseCompleted", () => {
  it("sends the signed PUT and returns the Sandra outcome id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ course_outcome: { id: "course-outcome-123" } }),
    });

    await expect(
      sendSandraCourseCompleted(INPUT, {
        env: ENV,
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ ok: true, id: "course-outcome-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("bounds a hung Sandra request with a timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    const resultPromise = sendSandraCourseCompleted(INPUT, {
      env: ENV,
      fetch: fetchMock as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(5);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      reason: "request_failed",
    });
    vi.useRealTimers();
  });

  it("caps an oversized timeout override to the cron-safe request budget", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const resultPromise = sendSandraCourseCompleted(INPUT, {
      env: { ...ENV, SANDRA_REQUEST_TIMEOUT_MS: "10000" },
      fetch: fetchMock as unknown as typeof fetch,
    });

    await vi.advanceTimersByTimeAsync(2_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toEqual({
      ok: false,
      reason: "request_failed",
    });
    vi.useRealTimers();
  });
});

describe("durable Sandra course completion reconciliation", () => {
  it("does not send while another caller owns a fresh delivery lease", async () => {
    const state = {
      payload: null as typeof INPUT | null,
      status: "delivering" as "pending" | "delivering" | "acknowledged",
      attempts: 1,
      remoteOutcomeId: null as string | null,
      settlements: [] as Array<Record<string, unknown>>,
    };
    const supabase = createCompletionSupabase(state);
    const originalRpc = supabase.rpc;
    supabase.rpc = async (name: string, args: Record<string, unknown>) => {
      if (name === "fn_claim_sandra_course_completion_delivery") {
        return {
          data: {
            payload: args.p_payload as typeof INPUT,
            status: "delivering",
            claimed: false,
            attemptCount: 1,
            remoteOutcomeId: null,
          },
          error: null,
        };
      }
      return originalRpc(name, args);
    };
    const fetchMock = vi.fn();

    await expect(reconcileSandraCourseCompleted(
      supabase,
      { userId: INPUT.userId, courseId: INPUT.courseId },
      {
        env: ENV,
        fetch: fetchMock as unknown as typeof fetch,
        deliveryClient: supabase,
      },
    )).resolves.toEqual({ ok: false, reason: "delivery_in_progress" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send a retry after another worker wins the next lease", async () => {
    const state = {
      payload: null as typeof INPUT | null,
      status: "pending" as "pending" | "delivering" | "acknowledged",
      attempts: 0,
      remoteOutcomeId: null as string | null,
      settlements: [] as Array<Record<string, unknown>>,
    };
    const supabase = createCompletionSupabase(state);
    const originalRpc = supabase.rpc;
    let claimCount = 0;
    supabase.rpc = async (name: string, args: Record<string, unknown>) => {
      if (name === "fn_claim_sandra_course_completion_delivery") {
        claimCount += 1;
        if (claimCount === 2) {
          return {
            data: {
              payload: state.payload ?? args.p_payload as typeof INPUT,
              status: "delivering",
              claimed: false,
              attemptCount: 2,
              remoteOutcomeId: null,
            },
            error: null,
          };
        }
      }
      return originalRpc(name, args);
    };
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => null,
    }));

    await expect(reconcileSandraCourseCompleted(
      supabase,
      { userId: INPUT.userId, courseId: INPUT.courseId },
      {
        env: ENV,
        fetch: fetchMock as unknown as typeof fetch,
        deliveryClient: supabase,
      },
    )).resolves.toEqual({ ok: false, reason: "delivery_in_progress" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("persists before a timeout, then retries the same event until acknowledged", async () => {
    vi.useFakeTimers();
    const state = {
      payload: null as typeof INPUT | null,
      status: "pending" as "pending" | "delivering" | "acknowledged",
      attempts: 0,
      remoteOutcomeId: null as string | null,
      settlements: [] as Array<Record<string, unknown>>,
    };
    const supabase = createCompletionSupabase(state);
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("timeout")));
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ course_outcome: { id: "sandra-outcome-1" } }),
      });

    const firstPromise = reconcileSandraCourseCompleted(
      supabase,
      { userId: INPUT.userId, courseId: INPUT.courseId },
      {
        env: ENV,
        fetch: fetchMock as unknown as typeof fetch,
        deliveryClient: supabase,
      },
    );
    await vi.advanceTimersByTimeAsync(5);
    await expect(firstPromise).resolves.toEqual({
      ok: true,
      id: "sandra-outcome-1",
    });
    expect(state.payload).toMatchObject({
      userId: INPUT.userId,
      courseId: INPUT.courseId,
      completedAt: INPUT.completedAt,
    });
    expect(state.status).toBe("acknowledged");
    expect(state.attempts).toBe(2);
    expect(state.remoteOutcomeId).toBe("sandra-outcome-1");

    const requestKeys = fetchMock.mock.calls.map(([, init]) =>
      (init as RequestInit).headers &&
      ((init as RequestInit).headers as Record<string, string>)["idempotency-key"]
    );
    expect(requestKeys).toEqual([
      `bmh-institute-course:${INPUT.userId}:${INPUT.courseId}:${INPUT.completedAt}`,
      `bmh-institute-course:${INPUT.userId}:${INPUT.courseId}:${INPUT.completedAt}`,
    ]);

    await expect(reconcileSandraCourseCompleted(
      supabase,
      { userId: INPUT.userId, courseId: INPUT.courseId },
      {
        env: ENV,
        fetch: fetchMock as unknown as typeof fetch,
        deliveryClient: supabase,
      },
    )).resolves.toEqual({ ok: true, id: "sandra-outcome-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("selects a bounded pending/stale batch, skips acknowledged rows, and isolates failures", async () => {
    const query = { filter: "", limit: 0 };
    const rows = [
      {
        user_id: "user-ok",
        course_id: "course-ok",
        status: "pending",
        last_attempt_at: null,
        updated_at: "2026-06-02T14:30:00.000Z",
      },
      {
        user_id: "user-fail",
        course_id: "course-fail",
        status: "delivering",
        last_attempt_at: "2026-06-02T14:20:00.000Z",
        updated_at: "2026-06-02T14:30:00.000Z",
      },
      {
        user_id: "user-acked",
        course_id: "course-acked",
        status: "acknowledged",
        last_attempt_at: "2026-06-02T14:20:00.000Z",
        updated_at: "2026-06-02T14:30:00.000Z",
      },
    ];
    const deliveryClient = createSweepSupabase(rows, query);
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("course-ok")
        ? {
            ok: true,
            json: async () => ({ course_outcome: { id: "outcome-ok" } }),
          }
        : { ok: false, json: async () => null },
    );

    await expect(reconcilePendingSandraCourseCompletions({
      env: ENV,
      fetch: fetchMock as unknown as typeof fetch,
      deliveryClient,
      batchSize: 500,
      now: new Date("2026-06-02T14:30:00.000Z"),
    })).resolves.toEqual({
      ok: true,
      selected: 2,
      acknowledged: 1,
      stillPending: 1,
      failures: [{
        userId: "user-fail",
        courseId: "course-fail",
        reason: "http_error",
      }],
    });
    expect(query.filter).toContain("status.eq.pending");
    expect(query.filter).toContain("status.eq.delivering");
    expect(query.filter).toContain("2026-06-02T14:25:00.000Z");
    expect(query.limit).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([url]) =>
      !String(url).includes("course-acked"),
    )).toBe(true);
  });

  it("continues to later rows when one reconciliation throws", async () => {
    const query = { filter: "", limit: 0 };
    const rows = [
      {
        user_id: "user-throw",
        course_id: "course-throw",
        status: "pending",
        last_attempt_at: null,
        updated_at: "2026-06-02T14:20:00.000Z",
      },
      {
        user_id: "user-after",
        course_id: "course-after",
        status: "pending",
        last_attempt_at: null,
        updated_at: "2026-06-02T14:21:00.000Z",
      },
    ];
    const deliveryClient = createSweepSupabase(rows, query);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ course_outcome: { id: "outcome-after" } }),
    }));

    await expect(reconcilePendingSandraCourseCompletions({
      env: ENV,
      fetch: fetchMock as unknown as typeof fetch,
      deliveryClient,
      now: new Date("2026-06-02T14:30:00.000Z"),
    })).resolves.toEqual({
      ok: true,
      selected: 2,
      acknowledged: 1,
      stillPending: 1,
      failures: [{
        userId: "user-throw",
        courseId: "course-throw",
        reason: "unexpected_error",
      }],
    });
    expect(query.limit).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function createCompletionSupabase(state: {
  payload: typeof INPUT | null;
  status: "pending" | "delivering" | "acknowledged";
  attempts: number;
  remoteOutcomeId: string | null;
  settlements: Array<Record<string, unknown>>;
}) {
  const maybeSingle = (data: unknown) => ({ data, error: null });
  return {
    from: (table: string) => {
      const data = table === "profiles"
        ? { email: INPUT.learnerEmail, full_name: INPUT.learnerName }
        : table === "courses"
          ? { title: INPUT.courseTitle }
          : table === "certificates"
            ? {
                id: "cert-123",
                certificate_number: INPUT.certificateNumber,
                issued_at: INPUT.completedAt,
              }
            : null;
      if (table === "program_courses") {
        return {
          select: () => ({ eq: async () => ({ data: [], error: null }) }),
        };
      }
      const chain = {
        eq: () => chain,
        maybeSingle: async () => maybeSingle(data),
      };
      return { select: () => chain };
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "fn_course_is_complete") return { data: true, error: null };
      if (name === "fn_course_completed_at") {
        return { data: INPUT.completedAt, error: null };
      }
      if (name === "fn_claim_sandra_course_completion_delivery") {
        if (state.payload === null) {
          state.payload = {
            ...(args.p_payload as typeof INPUT),
            userId: INPUT.userId,
            courseId: INPUT.courseId,
            completedAt: INPUT.completedAt,
          };
        }
        if (state.status !== "acknowledged") {
          state.status = "delivering";
          state.attempts += 1;
        }
        return {
          data: {
            payload: state.payload,
            status: state.status,
            claimed: state.status !== "acknowledged",
            attemptCount: state.attempts,
            remoteOutcomeId: state.remoteOutcomeId,
          },
          error: null,
        };
      }
      if (name === "fn_settle_sandra_course_completion_delivery") {
        state.settlements.push(args);
        if (args.p_acknowledged === true) {
          state.status = "acknowledged";
          state.remoteOutcomeId = String(args.p_remote_outcome_id);
        } else if (args.p_attempt_count === state.attempts) {
          state.status = "pending";
        }
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
}

function createSweepSupabase(
  rows: Array<Record<string, unknown>>,
  query: { filter: string; limit: number },
) {
  const states = new Map<string, {
    payload: Record<string, unknown> | null;
    status: "pending" | "delivering" | "acknowledged";
    attempts: number;
    remoteOutcomeId: string | null;
  }>();
  for (const row of rows) {
    states.set(String(row.course_id), {
      payload: null,
      status: row.status as "pending" | "delivering" | "acknowledged",
      attempts: 0,
      remoteOutcomeId: null,
    });
  }
  return {
    from: (table: string) => {
      if (table === "sandra_course_completion_deliveries") {
        return {
          select: () => ({
            or: (filter: string) => {
              query.filter = filter;
              return {
                order: () => ({
                  limit: async (limit: number) => {
                    query.limit = limit;
                    return { data: rows, error: null };
                  },
                }),
              };
            },
          }),
        };
      }
      if (table === "program_courses") {
        return {
          select: () => ({ eq: async () => ({ data: [], error: null }) }),
        };
      }
      const data = table === "profiles"
        ? { email: "learner@example.test", full_name: "Learner" }
        : table === "courses"
          ? { title: "Course" }
          : table === "certificates"
            ? null
            : null;
      const chain = {
        eq: () => chain,
        maybeSingle: async () => ({ data, error: null }),
      };
      return { select: () => chain };
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (
        name === "fn_course_is_complete" &&
        args.p_course_id === "course-throw"
      ) {
        throw new Error("simulated row failure");
      }
      if (name === "fn_course_is_complete") return { data: true, error: null };
      if (name === "fn_course_completed_at") {
        return { data: INPUT.completedAt, error: null };
      }
      const courseId = String(args.p_course_id);
      const state = states.get(courseId);
      if (!state) throw new Error(`Unexpected course ${courseId}`);
      if (name === "fn_claim_sandra_course_completion_delivery") {
        if (!state.payload) {
          state.payload = {
            ...(args.p_payload as Record<string, unknown>),
            completedAt: INPUT.completedAt,
          };
        }
        if (state.status !== "acknowledged") {
          state.status = "delivering";
          state.attempts += 1;
        }
        return {
          data: {
            payload: state.payload,
            status: state.status,
            claimed: state.status !== "acknowledged",
            attemptCount: state.attempts,
            remoteOutcomeId: state.remoteOutcomeId,
          },
          error: null,
        };
      }
      if (name === "fn_settle_sandra_course_completion_delivery") {
        if (args.p_acknowledged === true) {
          state.status = "acknowledged";
          state.remoteOutcomeId = String(args.p_remote_outcome_id);
        } else {
          state.status = "pending";
        }
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
}
