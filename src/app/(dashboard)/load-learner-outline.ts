import type { ContentBlock } from "@/components/content-blocks";
import {
  buildLearnerCourseOutline,
  type LearnerOutlineCourse,
  type LearnerOutlineLesson,
  type LearnerOutlineResult,
} from "@/lib/courses/learner-outline";
import { createClient } from "@/lib/supabase/server";

import { loadLearnerLessonStates } from "./lesson-state-rpc";

type DashboardClient = Awaited<ReturnType<typeof createClient>>;

export type LoadLearnerOutlineResult =
  | LearnerOutlineResult
  | { ok: false; error: string; notFound: true };

/** Loads learner-visible structure through the session client and projects it once. */
export async function loadLearnerCourseOutline({
  supabase,
  courseId,
  userId,
}: {
  supabase: DashboardClient;
  courseId: string;
  userId: string;
}): Promise<LoadLearnerOutlineResult> {
  const courseResult = await supabase
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
            thumbnail_approved_sha256,
            content_blocks (
              id,
              block_type,
              content,
              sort_order,
              is_required_for_completion
            )
          )
        )
      `,
    )
    .eq("id", courseId)
    .maybeSingle();

  if (courseResult.error) {
    return { ok: false, error: "Course structure could not be verified." };
  }
  if (!courseResult.data) {
    return { ok: false, error: "Course not found.", notFound: true };
  }
  const course = parseLearnerCourse(courseResult.data);
  if (!course.ok) return course;

  const lessons = course.course.modules.flatMap((module) => module.lessons);
  const assignmentLessonIds = lessons
    .filter((lesson) => lesson.lessonType === "assignment")
    .map((lesson) => lesson.id);
  const blocks = lessons.flatMap((lesson) => lesson.blocks);
  const [stateResult, submissionsResult, resumeResult, blockProgressResult] = await Promise.all([
    loadLearnerLessonStates(supabase, {
      userId,
      lessonIds: lessons.map((lesson) => lesson.id),
    }),
    assignmentLessonIds.length > 0
      ? supabase
          .from("assignment_submissions")
          .select("id, lesson_id, status, submitted_at")
          .eq("user_id", userId)
          .in("lesson_id", assignmentLessonIds)
          .order("submitted_at", { ascending: false })
          .order("id", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("user_course_resume")
      .select("last_lesson_id, last_block_id")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .maybeSingle(),
    blocks.length > 0
      ? supabase
          .from("user_block_progress")
          .select("block_id, asset_version")
          .eq("user_id", userId)
          .in("block_id", blocks.map((block) => block.id))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (
    !stateResult.ok ||
    submissionsResult.error ||
    resumeResult.error ||
    blockProgressResult.error
  ) {
    return { ok: false, error: "Learner progress could not be verified." };
  }
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
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
    if (
      assignmentSubmissions.has(row.lesson_id) ||
      !isSubmissionStatus(row.status)
    ) {
      continue;
    }
    assignmentSubmissions.set(row.lesson_id, row.status);
  }

  return buildLearnerCourseOutline({
    course: course.course,
    states: stateResult.states,
    assignmentSubmissions,
    completedBlockIds,
    resume: resumeResult.data
      ? {
          lastLessonId: resumeResult.data.last_lesson_id,
          lastBlockId: resumeResult.data.last_block_id,
        }
      : null,
  });
}

export function videoAssetVersion(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const content = value as Record<string, unknown>;
  const filePath = content.file_path;
  const duration = content.duration_seconds;
  return typeof filePath === "string" &&
    filePath.trim().length > 0 &&
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
    ? `${filePath.trim()}#duration=${duration}`
    : "";
}

type RawCourse = {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  thumbnail_path: string | null;
  content_import_id: string | null;
  thumbnail_asset_key: string | null;
  thumbnail_approved_path: string | null;
  thumbnail_approved_sha256: string | null;
  modules: RawModule[] | null;
};

type RawModule = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  lessons: RawLesson[] | null;
};

type RawLesson = {
  id: string;
  title: string;
  description: string | null;
  lesson_type: string;
  sort_order: number;
  prerequisite_lesson_id: string | null;
  quiz_id: string | null;
  assignment_id: string | null;
  is_required_for_completion: boolean;
  thumbnail_path: string | null;
  content_import_id: string | null;
  thumbnail_asset_key: string | null;
  thumbnail_approved_path: string | null;
  thumbnail_approved_sha256: string | null;
  content_blocks: ContentBlock[] | null;
};

export function parseLearnerCourse(
  value: unknown,
): { ok: true; course: LearnerOutlineCourse } | { ok: false; error: string } {
  const raw = value as RawCourse;
  const modules = [...(raw.modules ?? [])].map((module) => {
    const lessons: LearnerOutlineLesson[] = [];
    for (const row of module.lessons ?? []) {
      if (!isLessonType(row.lesson_type)) {
        return { ok: false as const, error: `Unknown lesson type on ${row.id}.` };
      }
      lessons.push({
        id: row.id,
        title: row.title,
        description: row.description,
        lessonType: row.lesson_type,
        sortOrder: row.sort_order,
        prerequisiteLessonId: row.prerequisite_lesson_id,
        quizId: row.quiz_id,
        assignmentId: row.assignment_id,
        isRequiredForCompletion: row.is_required_for_completion,
        thumbnailPath: row.thumbnail_path,
        contentImportId: row.content_import_id,
        thumbnailAssetKey: row.thumbnail_asset_key,
        thumbnailApprovedPath: row.thumbnail_approved_path,
        thumbnailApprovedSha256: row.thumbnail_approved_sha256,
        blocks: [...(row.content_blocks ?? [])],
      });
    }
    return {
      ok: true as const,
      module: {
        id: module.id,
        title: module.title,
        description: module.description,
        sortOrder: module.sort_order,
        lessons,
      },
    };
  });
  const invalid = modules.find((module) => !module.ok);
  if (invalid && !invalid.ok) return invalid;

  return {
    ok: true,
    course: {
      id: raw.id,
      title: raw.title,
      description: raw.description,
      isPublished: raw.is_published,
      thumbnailPath: raw.thumbnail_path,
      contentImportId: raw.content_import_id,
      thumbnailAssetKey: raw.thumbnail_asset_key,
      thumbnailApprovedPath: raw.thumbnail_approved_path,
      thumbnailApprovedSha256: raw.thumbnail_approved_sha256,
      modules: modules.flatMap((module) => (module.ok ? [module.module] : [])),
    },
  };
}

function isLessonType(value: string): value is LearnerOutlineLesson["lessonType"] {
  return value === "content" || value === "quiz" || value === "assignment";
}

function isSubmissionStatus(
  value: string,
): value is "submitted" | "approved" | "needs_revision" {
  return value === "submitted" || value === "approved" || value === "needs_revision";
}
