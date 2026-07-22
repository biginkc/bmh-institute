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
  { ok: true; states: Map<string, LearnerLessonState> } | { ok: false };

type AdminCompletionResult =
  | { ok: true; completions: VerifiedLessonCompletion[] }
  | { ok: false; error?: unknown };

const MAX_IDS_PER_AXIS = 500;
// Hosted Supabase projects return at most 1,000 rows from the Data API by
// default. Keep each cross-product below that response ceiling so the strict
// cardinality check below distinguishes real omissions from API truncation.
const MAX_ADMIN_PAIRS_PER_CALL = 1_000;
const MAX_ADMIN_TOTAL_PAIRS = 1_000_000;
const MAX_ADMIN_CONCURRENT_CALLS = 6;

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

export async function loadLearnerCourseLessonStates(
  supabase: SupabaseClient<Database>,
  input: { courseId: string; lessonIds: string[] },
): Promise<LessonStateResult> {
  const lessonIds = uniqueNonEmpty(input.lessonIds);
  if (lessonIds.length === 0) {
    return { ok: true, states: new Map() };
  }

  const requested = new Set(lessonIds);
  const states = new Map<string, LearnerLessonState>();
  for (const lessonBatch of chunks(lessonIds, MAX_IDS_PER_AXIS)) {
    const { data, error } = await supabase.rpc("fn_learner_lesson_states_v1", {
      p_course_id: input.courseId,
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
  if (
    !Number.isSafeInteger(expectedPairCount) ||
    expectedPairCount > MAX_ADMIN_TOTAL_PAIRS
  ) {
    return { ok: false };
  }
  const seenPairs = new Set<string>();
  const completions: VerifiedLessonCompletion[] = [];
  const batches: Array<{ userIds: string[]; lessonIds: string[] }> = [];

  // The RPC repeats actor-to-catalog authorization for every lesson in a
  // request. Keep the user axis large and split the lesson axis so each
  // lesson is authorized once per unavoidable user chunk rather than once
  // for every small group of users.
  for (const userBatch of chunks(userIds, MAX_IDS_PER_AXIS)) {
    const maxLessonsInBatch = Math.min(
      MAX_IDS_PER_AXIS,
      Math.floor(MAX_ADMIN_PAIRS_PER_CALL / userBatch.length),
    );
    for (const lessonBatch of chunks(lessonIds, maxLessonsInBatch)) {
      batches.push({ userIds: userBatch, lessonIds: lessonBatch });
    }
  }

  const batchResults = await mapWithConcurrency(
    batches,
    MAX_ADMIN_CONCURRENT_CALLS,
    async (batch): Promise<AdminCompletionBatchResult> => {
      let response;
      try {
        response = await supabase.rpc("fn_admin_lesson_completion_states", {
          p_user_ids: batch.userIds,
          p_lesson_ids: batch.lessonIds,
        });
      } catch (error) {
        return { ok: false, error };
      }
      const { data, error } = response;
      if (error) return { ok: false, error };
      if (!Array.isArray(data)) return { ok: false };

      const requestedUsers = new Set(batch.userIds);
      const requestedLessons = new Set(batch.lessonIds);
      const batchPairs = new Set<string>();
      const batchCompletions: VerifiedLessonCompletion[] = [];
      for (const row of data) {
        const key = pairKey(row.user_id, row.lesson_id);
        if (
          !requestedUsers.has(row.user_id) ||
          !requestedLessons.has(row.lesson_id) ||
          typeof row.is_complete !== "boolean" ||
          batchPairs.has(key)
        ) {
          return { ok: false };
        }
        batchPairs.add(key);

        if (!row.is_complete) continue;
        if (
          row.completed_at !== null &&
          (typeof row.completed_at !== "string" ||
            row.completed_at.length === 0)
        ) {
          return { ok: false };
        }
        batchCompletions.push({
          userId: row.user_id,
          lessonId: row.lesson_id,
          completedAt: row.completed_at,
        });
      }

      if (data.length !== batch.userIds.length * batch.lessonIds.length) {
        return { ok: false };
      }
      return {
        ok: true,
        pairs: [...batchPairs],
        completions: batchCompletions,
      };
    },
  );

  for (const result of batchResults) {
    if (!result.ok) {
      return result.error === undefined
        ? { ok: false }
        : { ok: false, error: result.error };
    }
    for (const key of result.pairs) {
      if (seenPairs.has(key)) return { ok: false };
      seenPairs.add(key);
    }
    completions.push(...result.completions);
  }

  return seenPairs.size === expectedPairCount
    ? { ok: true, completions }
    : { ok: false };
}

type AdminCompletionBatchResult =
  | {
      ok: true;
      pairs: string[];
      completions: VerifiedLessonCompletion[];
    }
  | { ok: false; error?: unknown };

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  transform: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, values.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await transform(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
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
