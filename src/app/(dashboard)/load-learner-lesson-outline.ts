import type { ContentBlock } from "@/components/content-blocks";
import { buildLearnerCourseOutline } from "@/lib/courses/learner-outline";
import { createClient } from "@/lib/supabase/server";
import { withLessonTiming } from "@/lib/performance/lesson-timing";

import {
  parseLearnerCourse,
  type LoadLearnerOutlineResult,
  videoAssetVersion,
} from "./load-learner-outline";
import { loadLearnerLessonStates } from "./lesson-state-rpc";

type DashboardClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Loads the navigation metadata for a course but hydrates content and progress
 * only for the lesson being rendered. RLS remains the authorization boundary
 * for every query.
 */
export async function loadLearnerLessonOutline({
  supabase,
  courseId,
  lessonId,
  userId,
}: {
  supabase: DashboardClient;
  courseId: string;
  lessonId: string;
  userId: string;
}): Promise<LoadLearnerOutlineResult> {
  const courseResult = await withLessonTiming("lightweight-outline", async () =>
    supabase
      .from("courses")
      .select(
      `
        id,
        title,
        description,
        is_published,
        thumbnail_path,
        content_import_id,
        thumbnail_asset_key,
        thumbnail_approved_path,
        thumbnail_approved_sha256,
        modules (
          id,
          title,
          description,
          sort_order,
          lessons (
            id,
            title,
            description,
            lesson_type,
            sort_order,
            prerequisite_lesson_id,
            quiz_id,
            assignment_id,
            is_required_for_completion,
            thumbnail_path,
            content_import_id,
            thumbnail_asset_key,
            thumbnail_approved_path,
            thumbnail_approved_sha256
          )
        )
      `,
      )
      .eq("id", courseId)
      .maybeSingle(),
  );

  if (courseResult.error) {
    return { ok: false, error: "Course structure could not be verified." };
  }
  if (!courseResult.data) {
    return { ok: false, error: "Course not found.", notFound: true };
  }

  const parsed = parseLearnerCourse(courseResult.data);
  if (!parsed.ok) return parsed;
  const lessons = parsed.course.modules.flatMap((module) => module.lessons);
  const lesson = lessons.find((candidate) => candidate.id === lessonId);
  if (!lesson) return { ok: false, error: "Lesson not found.", notFound: true };

  const [blocksResult, stateResult, submissionsResult] = await Promise.all([
    withLessonTiming("current-blocks", async () =>
      supabase
        .from("content_blocks")
        .select("id, block_type, content, sort_order, is_required_for_completion")
        .eq("lesson_id", lessonId)
        .order("sort_order")
        .order("id"),
    ),
    withLessonTiming("lesson-states", () =>
      loadLearnerLessonStates(supabase, {
        userId,
        lessonIds: lessons.map((candidate) => candidate.id),
      }),
    ),
    lesson.lessonType === "assignment"
      ? withLessonTiming("current-assignment-status", async () =>
          supabase
            .from("assignment_submissions")
            .select("id, lesson_id, status, submitted_at")
            .eq("user_id", userId)
            .eq("lesson_id", lessonId)
            .order("submitted_at", { ascending: false })
            .order("id", { ascending: false }),
        )
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (blocksResult.error || !stateResult.ok || submissionsResult.error) {
    return { ok: false, error: "Learner progress could not be verified." };
  }

  const currentBlocks = (blocksResult.data ?? []) as unknown as ContentBlock[];
  lesson.blocks = currentBlocks;
  const blockProgressResult =
    currentBlocks.length > 0
      ? await withLessonTiming("current-block-progress", async () =>
          supabase
            .from("user_block_progress")
            .select("block_id, asset_version")
            .eq("user_id", userId)
            .in("block_id", currentBlocks.map((block) => block.id)),
        )
      : { data: [], error: null };
  if (blockProgressResult.error) {
    return { ok: false, error: "Learner progress could not be verified." };
  }

  const blocksById = new Map(currentBlocks.map((block) => [block.id, block]));
  const completedBlockIds = new Set(
    (blockProgressResult.data ?? []).flatMap((row) => {
      const block = blocksById.get(row.block_id);
      if (!block) return [];
      if (block.block_type !== "video") return [row.block_id];
      const version = videoAssetVersion(block.content);
      return version && row.asset_version === version ? [row.block_id] : [];
    }),
  );

  const assignmentSubmissions = new Map<
    string,
    "submitted" | "approved" | "needs_revision"
  >();
  for (const row of submissionsResult.data ?? []) {
    if (!assignmentSubmissions.has(row.lesson_id) && isSubmissionStatus(row.status)) {
      assignmentSubmissions.set(row.lesson_id, row.status);
    }
  }

  return buildLearnerCourseOutline({
    course: parsed.course,
    states: stateResult.states,
    assignmentSubmissions,
    completedBlockIds,
    resume: null,
  });
}

function isSubmissionStatus(
  value: string,
): value is "submitted" | "approved" | "needs_revision" {
  return value === "submitted" || value === "approved" || value === "needs_revision";
}
