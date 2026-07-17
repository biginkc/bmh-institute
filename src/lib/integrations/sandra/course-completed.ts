import { createHmac } from "node:crypto";

import { getAppUrl } from "@/lib/app-url";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  SANDRA_DELIVERY_MAX_ATTEMPTS,
  SANDRA_DELIVERY_REQUEST_TIMEOUT_MS,
  SANDRA_DELIVERY_SWEEP_BATCH_SIZE,
} from "./delivery-policy";

type SupabaseLike = {
  // Supabase's fluent PostgREST builder varies by table and selected relation.
  // This integration deliberately accepts the app client and test doubles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: any;
};

export type SandraCourseCompletedInput = {
  userId: string;
  courseId: string;
  learnerEmail?: string | null;
  learnerName?: string | null;
  courseTitle?: string | null;
  completedAt: string;
  certificateNumber?: string | null;
  certificateUrl?: string | null;
};

export type SandraCourseCompletedResult =
  | { ok: true; id?: string }
  | { ok: false; reason: "not_configured" | "not_complete" | "lookup_failed" | "persistence_failed" | "delivery_in_progress" | "request_failed" | "http_error" };

function sign(body: string, token: string): string {
  return "sha256=" + createHmac("sha256", token).update(body).digest("hex");
}

function endpoint(baseUrl: string, completionId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/internal/bmh-institute/course-outcomes/by-course-completion/${encodeURIComponent(completionId)}`;
}

function completionId(input: Pick<SandraCourseCompletedInput, "userId" | "courseId">): string {
  return `${input.userId}:${input.courseId}`;
}

function idempotencyKey(input: Pick<SandraCourseCompletedInput, "userId" | "courseId" | "completedAt">): string {
  return `bmh-institute-course:${input.userId}:${input.courseId}:${input.completedAt}`;
}

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.SANDRA_REQUEST_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0
    ? Math.min(raw, SANDRA_DELIVERY_REQUEST_TIMEOUT_MS)
    : SANDRA_DELIVERY_REQUEST_TIMEOUT_MS;
}

function isConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.SANDRA_API_BASE_URL && env.SANDRA_SERVICE_TOKEN && env.SANDRA_ORG_ID,
  );
}

export function buildSandraCourseCompletedRequest(
  input: SandraCourseCompletedInput,
  env: NodeJS.ProcessEnv,
): { url: string; body: string; headers: Record<string, string> } | null {
  const baseUrl = env.SANDRA_API_BASE_URL;
  const token = env.SANDRA_SERVICE_TOKEN;
  const orgId = env.SANDRA_ORG_ID;
  if (!baseUrl || !token || !orgId) return null;

  const body = JSON.stringify({
    org_id: orgId,
    institute_user_id: input.userId,
    learner_email: input.learnerEmail ?? null,
    learner_name: input.learnerName ?? null,
    course_id: input.courseId,
    course_title: input.courseTitle ?? null,
    status: "completed",
    completed_at: input.completedAt,
    certificate_number: input.certificateNumber ?? null,
    certificate_url: input.certificateUrl ?? null,
  });

  return {
    url: endpoint(baseUrl, completionId(input)),
    body,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey(input),
      "x-sandra-signature": sign(body, token),
    },
  };
}

export async function sendSandraCourseCompleted(
  input: SandraCourseCompletedInput,
  deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<SandraCourseCompletedResult> {
  const env = deps.env ?? process.env;
  const request = buildSandraCourseCompletedRequest(input, env);
  if (!request) return { ok: false, reason: "not_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs(env));
  try {
    const response = await (deps.fetch ?? fetch)(request.url, {
      method: "PUT",
      headers: request.headers,
      signal: controller.signal,
      body: request.body,
    });

    if (!response.ok) return { ok: false, reason: "http_error" };

    const json = (await response.json().catch(() => null)) as
      | { course_outcome?: { id?: string } }
      | null;
    return { ok: true, id: json?.course_outcome?.id };
  } catch {
    return { ok: false, reason: "request_failed" };
  } finally {
    clearTimeout(timer);
  }
}

export async function emitSandraCourseCompletedForLesson(
  supabase: SupabaseLike,
  args: { userId: string; lessonId: string },
): Promise<SandraCourseCompletedResult> {
  // The completion trigger has already persisted a pending delivery. Avoid
  // lookup work until a provider is configured; reconciliation can claim it
  // later without losing the original completion timestamp.
  if (!isConfigured()) return { ok: false, reason: "not_configured" };
  const courseId = await courseIdForLesson(supabase, args.lessonId);
  if (!courseId) return { ok: false, reason: "lookup_failed" };
  return emitSandraCourseCompletedIfNeeded(supabase, {
    userId: args.userId,
    courseId,
  });
}

export async function emitSandraCourseCompletedForBlock(
  supabase: SupabaseLike,
  args: { userId: string; blockId: string },
): Promise<SandraCourseCompletedResult> {
  if (!isConfigured()) return { ok: false, reason: "not_configured" };
  const { data: block, error: blockError } = await supabase
    .from("content_blocks")
    .select("lesson_id")
    .eq("id", args.blockId)
    .maybeSingle();
  if (blockError || !block?.lesson_id) return { ok: false, reason: "lookup_failed" };

  return emitSandraCourseCompletedForLesson(supabase, {
    userId: args.userId,
    lessonId: String(block.lesson_id),
  });
}

export async function emitSandraCourseCompletedIfNeeded(
  supabase: SupabaseLike,
  args: { userId: string; courseId: string },
  deps: {
    fetch?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deliveryClient?: SupabaseLike;
  } = {},
): Promise<SandraCourseCompletedResult> {
  if (!isConfigured(deps.env ?? process.env)) {
    return { ok: false, reason: "not_configured" };
  }
  const { data: complete, error: completeError } = await supabase.rpc(
    "fn_course_is_complete",
    { p_user_id: args.userId, p_course_id: args.courseId },
  );
  if (completeError) return { ok: false, reason: "lookup_failed" };
  if (complete !== true) return { ok: false, reason: "not_complete" };

  const details = await courseCompletionDetails(supabase, args);
  if (!details) return { ok: false, reason: "lookup_failed" };
  let deliveryClient: SupabaseLike;
  try {
    deliveryClient = deps.deliveryClient ?? createAdminClient();
  } catch {
    return { ok: false, reason: "persistence_failed" };
  }
  const { data: delivery, error: deliveryError } = await deliveryClient.rpc(
    "fn_claim_sandra_course_completion_delivery",
    {
      p_user_id: args.userId,
      p_course_id: args.courseId,
      p_payload: details,
    },
  );
  let claimed = parseClaimedDelivery(delivery);
  if (deliveryError || !claimed) {
    return { ok: false, reason: "persistence_failed" };
  }
  if (claimed.status === "acknowledged") {
    return { ok: true, id: claimed.remoteOutcomeId ?? undefined };
  }
  if (!claimed.claimed) {
    return { ok: false, reason: "delivery_in_progress" };
  }

  // The durable claim is committed before any network request begins. Retry a
  // single transient failure immediately; if both attempts fail, a later call
  // to this reconciliation path claims the still-pending delivery again.
  let lastFailure: Extract<SandraCourseCompletedResult, { ok: false }> = {
    ok: false,
    reason: "request_failed",
  };
  for (let attempt = 0; attempt < SANDRA_DELIVERY_MAX_ATTEMPTS; attempt += 1) {
    const result = await sendSandraCourseCompleted(claimed.payload, deps);
    const { error: settleError } = await deliveryClient.rpc(
      "fn_settle_sandra_course_completion_delivery",
      {
        p_user_id: args.userId,
        p_course_id: args.courseId,
        p_attempt_count: claimed.attemptCount,
        p_acknowledged: result.ok,
        p_error: result.ok ? null : result.reason,
        p_remote_outcome_id: result.ok ? result.id ?? null : null,
      },
    );
    if (settleError) return { ok: false, reason: "persistence_failed" };
    if (result.ok) return result;
    lastFailure = result;
    if (attempt < SANDRA_DELIVERY_MAX_ATTEMPTS - 1) {
      const { data: retry, error: retryError } = await deliveryClient.rpc(
        "fn_claim_sandra_course_completion_delivery",
        {
          p_user_id: args.userId,
          p_course_id: args.courseId,
          p_payload: details,
        },
      );
      claimed = parseClaimedDelivery(retry);
      if (retryError || !claimed) {
        return { ok: false, reason: "persistence_failed" };
      }
      if (claimed.status === "acknowledged") {
        return { ok: true, id: claimed.remoteOutcomeId ?? undefined };
      }
      if (!claimed.claimed) {
        return { ok: false, reason: "delivery_in_progress" };
      }
    }
  }
  console.warn("[emitSandraCourseCompletedIfNeeded] Sandra writeback failed", {
    userId: args.userId,
    courseId: args.courseId,
    reason: lastFailure.reason,
  });
  return lastFailure;
}

/**
 * Safe repair entrypoint for a course that completed before Sandra was
 * configured or while Sandra was unavailable. The database refuses to claim a
 * delivery without current completion evidence and makes repeated calls
 * idempotent by learner/course.
 */
export async function reconcileSandraCourseCompleted(
  supabase: SupabaseLike,
  args: { userId: string; courseId: string },
  deps: {
    fetch?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deliveryClient?: SupabaseLike;
  } = {},
): Promise<SandraCourseCompletedResult> {
  return emitSandraCourseCompletedIfNeeded(supabase, args, deps);
}

export type SandraDeliverySweepResult =
  | {
      ok: true;
      selected: number;
      acknowledged: number;
      stillPending: number;
      failures: Array<{ userId: string; courseId: string; reason: string }>;
    }
  | { ok: false; reason: "not_configured" | "persistence_failed" };

/**
 * Bounded operational sweep used by the scheduled route. Pending deliveries
 * are always eligible; a delivering row is reclaimed only after five minutes
 * so overlapping cron invocations do not immediately duplicate an in-flight
 * request. Each row is isolated so one malformed or unavailable course cannot
 * stop the rest of the batch.
 */
export async function reconcilePendingSandraCourseCompletions(
  deps: {
    fetch?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deliveryClient?: SupabaseLike;
    batchSize?: number;
    now?: Date;
  } = {},
): Promise<SandraDeliverySweepResult> {
  const env = deps.env ?? process.env;
  if (!isConfigured(env)) return { ok: false, reason: "not_configured" };
  let deliveryClient: SupabaseLike;
  try {
    deliveryClient = deps.deliveryClient ?? createAdminClient();
  } catch {
    return { ok: false, reason: "persistence_failed" };
  }
  const requestedBatchSize =
    deps.batchSize ?? SANDRA_DELIVERY_SWEEP_BATCH_SIZE;
  const batchSize = Math.max(1, Math.min(100, Math.floor(requestedBatchSize)));
  const staleBefore = new Date(
    (deps.now ?? new Date()).getTime() - 5 * 60 * 1_000,
  ).toISOString();
  const { data, error } = await deliveryClient
    .from("sandra_course_completion_deliveries")
    .select("user_id, course_id, status, last_attempt_at, updated_at")
    .or(
      `status.eq.pending,and(status.eq.delivering,last_attempt_at.lt.${staleBefore})`,
    )
    .order("updated_at", { ascending: true })
    .limit(batchSize);
  if (error) return { ok: false, reason: "persistence_failed" };

  const rows = (data ?? []) as Array<{
    user_id: string;
    course_id: string;
    status: string;
  }>;
  let acknowledged = 0;
  let stillPending = 0;
  const failures: Array<{ userId: string; courseId: string; reason: string }> = [];
  for (const row of rows) {
    // The query excludes acknowledged rows; keep a defensive check in case a
    // test double or a concurrent snapshot supplies one anyway.
    if (row.status === "acknowledged") continue;
    try {
      const result = await reconcileSandraCourseCompleted(
        deliveryClient,
        { userId: row.user_id, courseId: row.course_id },
        {
          env,
          fetch: deps.fetch,
          deliveryClient,
        },
      );
      if (result.ok) {
        acknowledged += 1;
      } else {
        stillPending += 1;
        failures.push({
          userId: row.user_id,
          courseId: row.course_id,
          reason: result.reason,
        });
      }
    } catch {
      stillPending += 1;
      failures.push({
        userId: row.user_id,
        courseId: row.course_id,
        reason: "unexpected_error",
      });
    }
  }
  return {
    ok: true,
    selected: rows.filter((row) => row.status !== "acknowledged").length,
    acknowledged,
    stillPending,
    failures,
  };
}

function parseClaimedDelivery(value: unknown): {
  payload: SandraCourseCompletedInput;
  status: "pending" | "delivering" | "acknowledged";
  claimed: boolean;
  attemptCount: number;
  remoteOutcomeId: string | null;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    !row.payload ||
    typeof row.payload !== "object" ||
    Array.isArray(row.payload) ||
    !["pending", "delivering", "acknowledged"].includes(String(row.status)) ||
    typeof row.claimed !== "boolean" ||
    typeof row.attemptCount !== "number" ||
    !Number.isInteger(row.attemptCount) ||
    row.attemptCount < 0
  ) {
    return null;
  }
  const payload = row.payload as Record<string, unknown>;
  if (
    typeof payload.userId !== "string" ||
    typeof payload.courseId !== "string" ||
    typeof payload.completedAt !== "string"
  ) {
    return null;
  }
  return {
    payload: payload as SandraCourseCompletedInput,
    status: row.status as "pending" | "delivering" | "acknowledged",
    claimed: row.claimed,
    attemptCount: row.attemptCount,
    remoteOutcomeId:
      typeof row.remoteOutcomeId === "string" ? row.remoteOutcomeId : null,
  };
}

async function courseIdForLesson(
  supabase: SupabaseLike,
  lessonId: string,
): Promise<string | null> {
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("module_id")
    .eq("id", lessonId)
    .maybeSingle();
  if (lessonError || !lesson?.module_id) return null;

  const { data: module, error: moduleError } = await supabase
    .from("modules")
    .select("course_id")
    .eq("id", lesson.module_id)
    .maybeSingle();
  if (moduleError || !module?.course_id) return null;
  return String(module.course_id);
}

async function courseCompletionDetails(
  supabase: SupabaseLike,
  args: { userId: string; courseId: string },
): Promise<SandraCourseCompletedInput | null> {
  const [profileResult, courseResult, certificateResult, completedAtResult, programLinksResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", args.userId)
      .maybeSingle(),
    supabase
      .from("courses")
      .select("title")
      .eq("id", args.courseId)
      .maybeSingle(),
    supabase
      .from("certificates")
      .select("id, certificate_number, issued_at")
      .eq("user_id", args.userId)
      .eq("course_id", args.courseId)
      .maybeSingle(),
    supabase.rpc("fn_course_completed_at", {
      p_user_id: args.userId,
      p_course_id: args.courseId,
    }),
    supabase
      .from("program_courses")
      .select("program_id", { count: "exact" })
      .eq("course_id", args.courseId)
      .limit(2),
  ]);

  if (
    profileResult.error ||
    courseResult.error ||
    certificateResult.error ||
    completedAtResult.error ||
    programLinksResult.error
  ) {
    return null;
  }

  const programLinks = (programLinksResult.data ?? []) as Array<{ program_id: string }>;
  const programIds = [...new Set(programLinks.map(
    (row: { program_id: string }) => row.program_id,
  ))];
  // A reusable course may belong to more than one program. Without program
  // context on the completion event, selecting the newest certificate across
  // all linked programs can attach the wrong credential. Bind a program
  // certificate only when the course has exactly one unambiguous program.
  const exactProgramId = programLinksResult.count === 1
    && programLinks.length === 1
    && programIds.length === 1
    ? programIds[0]
    : null;
  const programCertificateResult = exactProgramId
    ? await supabase
        .from("program_certificates")
        .select("id, program_id, certificate_number, issued_at")
        .eq("user_id", args.userId)
        .eq("program_id", exactProgramId)
        .maybeSingle()
    : { data: null, error: null };
  if (programCertificateResult.error) return null;

  const profile = profileResult.data as
    | { email?: string | null; full_name?: string | null }
    | null;
  const course = courseResult.data as { title?: string | null } | null;
  const certificate = certificateResult.data as
    | { id?: string | null; certificate_number?: string | null; issued_at?: string | null }
    | null;
  const programCertificate = programCertificateResult.data as
    | { id?: string | null; program_id?: string | null; certificate_number?: string | null; issued_at?: string | null }
    | null;
  if (programCertificate && programCertificate.program_id !== exactProgramId) return null;
  const finalCertificate = programCertificate ?? certificate;
  const certificatePath = programCertificate?.id
    ? `/certificates/program/${programCertificate.id}`
    : certificate?.id
      ? `/certificates/course/${certificate.id}`
      : null;

  return {
    userId: args.userId,
    courseId: args.courseId,
    learnerEmail: profile?.email ?? null,
    learnerName: profile?.full_name ?? null,
    courseTitle: course?.title ?? null,
    completedAt:
      (completedAtResult.data as string | null) ??
      finalCertificate?.issued_at ??
      new Date().toISOString(),
    certificateNumber: finalCertificate?.certificate_number ?? null,
    certificateUrl: certificatePath ? `${getAppUrl()}${certificatePath}` : null,
  };
}
