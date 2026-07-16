import { createHmac } from "node:crypto";

import { getAppUrl } from "@/lib/app-url";

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
  | { ok: false; reason: "not_configured" | "not_complete" | "lookup_failed" | "request_failed" | "http_error" };

const DEFAULT_TIMEOUT_MS = 3_000;

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
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function isConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SANDRA_API_BASE_URL && env.SANDRA_SERVICE_TOKEN && env.SANDRA_ORG_ID);
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
): Promise<SandraCourseCompletedResult> {
  if (!isConfigured()) return { ok: false, reason: "not_configured" };
  const { data: complete, error: completeError } = await supabase.rpc(
    "fn_course_is_complete",
    { p_user_id: args.userId, p_course_id: args.courseId },
  );
  if (completeError) return { ok: false, reason: "lookup_failed" };
  if (complete !== true) return { ok: false, reason: "not_complete" };

  const details = await courseCompletionDetails(supabase, args);
  if (!details) return { ok: false, reason: "lookup_failed" };
  const result = await sendSandraCourseCompleted(details);
  if (!result.ok) {
    console.warn("[emitSandraCourseCompletedIfNeeded] Sandra writeback failed", {
      userId: args.userId,
      courseId: args.courseId,
      reason: result.reason,
    });
  }
  return result;
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
      .select("program_id")
      .eq("course_id", args.courseId),
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

  const programIds = (programLinksResult.data ?? []).map(
    (row: { program_id: string }) => row.program_id,
  );
  const programCertificateResult = programIds.length
    ? await supabase
        .from("program_certificates")
        .select("id, certificate_number, issued_at")
        .eq("user_id", args.userId)
        .in("program_id", programIds)
        .order("issued_at", { ascending: false })
        .limit(1)
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
    | { id?: string | null; certificate_number?: string | null; issued_at?: string | null }
    | null;
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
