import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

export type LearnerLessonState = {
  lessonId: string;
  isComplete: boolean;
  isUnlocked: boolean;
};

export type VerifiedLessonCompletion = {
  userId: string;
  lessonId: string;
  completedAt: string | null;
};

type LessonStateResult =
  | { ok: true; states: Map<string, LearnerLessonState> }
  | { ok: false };

type AdminCompletionResult =
  | { ok: true; completions: VerifiedLessonCompletion[] }
  | { ok: false };

const MAX_IDS_PER_AXIS = 500;
// Hosted Supabase projects return at most 1,000 rows from the Data API by
// default. Keep each cross-product below that response ceiling so the strict
// cardinality check below distinguishes real omissions from API truncation.
const MAX_ADMIN_PAIRS_PER_CALL = 1_000;

export async function loadLearnerLessonStates(
  supabase: SupabaseClient<Database>,
  input: { userId: string; lessonIds: string[] },
): Promise<LessonStateResult> {
  const lessonIds = uniqueNonEmpty(input.lessonIds);
  if (lessonIds.length === 0) {
    return { ok: true, states: new Map() };
  }

  const requested = new Set(lessonIds);
  const states = new Map<string, LearnerLessonState>();
  for (const lessonBatch of chunks(lessonIds, MAX_IDS_PER_AXIS)) {
    const { data, error } = await supabase.rpc("fn_lesson_states", {
      p_user_id: input.userId,
      p_lesson_ids: lessonBatch,
    });
    if (error || !Array.isArray(data)) return { ok: false };

    for (const row of data) {
      if (
        !requested.has(row.lesson_id) ||
        typeof row.is_complete !== "boolean" ||
        typeof row.is_unlocked !== "boolean" ||
        states.has(row.lesson_id)
      ) {
        return { ok: false };
      }
      states.set(row.lesson_id, {
        lessonId: row.lesson_id,
        isComplete: row.is_complete,
        isUnlocked: row.is_unlocked,
      });
    }
  }

  return states.size === lessonIds.length
    ? { ok: true, states }
    : { ok: false };
}

export async function loadAdminLessonCompletions(
  supabase: SupabaseClient<Database>,
  input: { userIds: string[]; lessonIds: string[] },
): Promise<AdminCompletionResult> {
  const userIds = uniqueNonEmpty(input.userIds);
  const lessonIds = uniqueNonEmpty(input.lessonIds);
  if (userIds.length === 0 || lessonIds.length === 0) {
    return { ok: true, completions: [] };
  }

  const expectedPairCount = userIds.length * lessonIds.length;
  const seenPairs = new Set<string>();
  const completions: VerifiedLessonCompletion[] = [];

  for (const lessonBatch of chunks(lessonIds, MAX_IDS_PER_AXIS)) {
    const maxUsersInBatch = Math.min(
      MAX_IDS_PER_AXIS,
      Math.floor(MAX_ADMIN_PAIRS_PER_CALL / lessonBatch.length),
    );
    for (const userBatch of chunks(userIds, maxUsersInBatch)) {
      const { data, error } = await supabase.rpc(
        "fn_admin_lesson_completion_states",
        {
          p_user_ids: userBatch,
          p_lesson_ids: lessonBatch,
        },
      );
      if (error || !Array.isArray(data)) return { ok: false };

      const requestedUsers = new Set(userBatch);
      const requestedLessons = new Set(lessonBatch);
      for (const row of data) {
        const key = pairKey(row.user_id, row.lesson_id);
        if (
          !requestedUsers.has(row.user_id) ||
          !requestedLessons.has(row.lesson_id) ||
          typeof row.is_complete !== "boolean" ||
          seenPairs.has(key)
        ) {
          return { ok: false };
        }
        seenPairs.add(key);

        if (!row.is_complete) continue;
        if (
          row.completed_at !== null &&
          (typeof row.completed_at !== "string" || row.completed_at.length === 0)
        ) {
          return { ok: false };
        }
        completions.push({
          userId: row.user_id,
          lessonId: row.lesson_id,
          completedAt: row.completed_at,
        });
      }

      if (data.length !== userBatch.length * lessonBatch.length) {
        return { ok: false };
      }
    }
  }

  return seenPairs.size === expectedPairCount
    ? { ok: true, completions }
    : { ok: false };
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function pairKey(userId: string, lessonId: string): string {
  return `${userId}\u0000${lessonId}`;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
