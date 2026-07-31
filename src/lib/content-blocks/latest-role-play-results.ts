import type { RolePlayLatestResult } from "@/lib/content-security/validate";

export type RolePlayResultRow = {
  block_id: string;
  score: number | string | null;
  goals_met: unknown;
  summary: unknown;
  completed_at: string;
};

/**
 * Reduces `role_play_results` rows down to one `RolePlayLatestResult` per
 * block — the most recent attempt only. A learner can retake the same
 * exercise, so multiple rows can share a `block_id`; per the "show most
 * recent, not best" decision, the first row seen for a block wins and every
 * later (older) row for that block is discarded.
 *
 * This function trusts the caller's row order completely — it does no
 * sorting of its own. The caller (`fetchLatestRolePlayResults` in
 * `lessons/[lessonId]/page.tsx`) MUST order by `completed_at DESC, id DESC`.
 * `completed_at` alone is not a unique key: two attempts can share a
 * timestamp at this column's precision, and without the `id` tiebreak,
 * Postgres does not guarantee which of the tied rows sorts first — "most
 * recent" would be accidental, not deterministic, on a tie.
 */
export function reduceLatestRolePlayResults(
  rows: RolePlayResultRow[],
): Map<string, RolePlayLatestResult> {
  const results = new Map<string, RolePlayLatestResult>();
  for (const row of rows) {
    if (results.has(row.block_id)) continue;
    results.set(row.block_id, toLatestResult(row));
  }
  return results;
}

function toLatestResult(row: RolePlayResultRow): RolePlayLatestResult {
  const goalsMet =
    row.goals_met && typeof row.goals_met === "object" && !Array.isArray(row.goals_met)
      ? (row.goals_met as Record<string, unknown>)
      : null;
  const goalsMetValues = goalsMet ? Object.values(goalsMet) : null;
  const summary =
    row.summary && typeof row.summary === "object" && !Array.isArray(row.summary)
      ? (row.summary as Record<string, unknown>)
      : null;
  const score = coerceScore(row.score);
  return {
    score,
    goalsMetCount: goalsMetValues ? goalsMetValues.filter(Boolean).length : null,
    goalsTotalCount: goalsMetValues ? goalsMetValues.length : null,
    summaryUrl:
      summary && typeof summary.summary_url === "string" ? summary.summary_url : null,
    completedAt: row.completed_at,
  };
}

// `role_play_results.score` is a Postgres `numeric` column; some
// postgrest-js configurations return it as a string to avoid float
// precision loss, so both shapes are handled defensively here.
function coerceScore(value: number | string | null): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
