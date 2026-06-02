import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  buildSandraCourseCompletedRequest,
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
});
