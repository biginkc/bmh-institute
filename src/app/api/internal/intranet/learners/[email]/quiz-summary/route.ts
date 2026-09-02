import { createHash, timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = { "Cache-Control": "private, no-store" };
const PASSING_SCORE = 85;
const MIN_SERVICE_TOKEN_BYTES = 32;
const CANONICAL_COURSE_IMPORT_ID = "bmh-employee-training-v1";
const SERVICE_TOKEN_PLACEHOLDER =
  "replace_with_long_random_intranet_service_token";

type QuizSummaryRow = {
  attempts: number;
  best_final_quiz_score: number | null;
  catalog_valid: boolean;
  email: string | null;
  last_attempt_at: string | null;
  profile_match_count: number;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  if (!hasValidAuthorization(request)) {
    return json({ error: "unauthorized" }, 401);
  }

  const { email: rawEmail } = await params;
  const requestedEmail = rawEmail.trim().toLowerCase();
  if (!requestedEmail || requestedEmail.length > 320) {
    return json({ error: "learner not found" }, 404);
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc(
      "fn_intranet_learner_quiz_summary_v1",
      {
        p_email: requestedEmail,
        p_course_import_id: CANONICAL_COURSE_IMPORT_ID,
      },
    );
    const rows = (data ?? []) as QuizSummaryRow[];
    if (error || rows.length !== 1) {
      return json({ error: "quiz summary unavailable" }, 503);
    }

    const summary = rows[0];
    if (summary.profile_match_count === 0) {
      return json({ error: "learner not found" }, 404);
    }
    if (!hasValidSummary(summary)) {
      return json({ error: "quiz summary unavailable" }, 503);
    }

    return json({
      email: summary.email,
      bestFinalQuizScore: summary.best_final_quiz_score,
      passed85:
        summary.best_final_quiz_score !== null &&
        summary.best_final_quiz_score >= PASSING_SCORE,
      attempts: summary.attempts,
      lastAttemptAt: summary.last_attempt_at,
    });
  } catch {
    return json({ error: "quiz summary unavailable" }, 503);
  }
}

function hasValidAuthorization(request: Request): boolean {
  const secret = process.env.INTRANET_SERVICE_TOKEN;
  const authorization = request.headers.get("authorization");
  if (
    !secret ||
    !authorization ||
    secret !== secret.trim() ||
    Buffer.byteLength(secret, "utf8") < MIN_SERVICE_TOKEN_BYTES ||
    secret === SERVICE_TOKEN_PLACEHOLDER
  ) {
    return false;
  }

  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256").update(authorization).digest();
  return timingSafeEqual(expected, received);
}

function hasValidSummary(summary: QuizSummaryRow): summary is QuizSummaryRow & {
  email: string;
} {
  if (
    summary.profile_match_count !== 1 ||
    !summary.email ||
    !summary.catalog_valid ||
    !Number.isSafeInteger(summary.attempts) ||
    summary.attempts < 0
  ) {
    return false;
  }
  if (summary.attempts === 0) {
    return (
      summary.best_final_quiz_score === null && summary.last_attempt_at === null
    );
  }
  return summary.last_attempt_at !== null;
}

function json(body: object, status = 200): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}
