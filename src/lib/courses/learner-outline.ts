import type { ContentBlock } from "@/components/content-blocks";
import { firstActionablePartId, partIdForBlock } from "@/lib/content-blocks/learner-parts";

export type LearnerOutlineLesson = {
  id: string;
  title: string;
  description: string | null;
  lessonType: "content" | "quiz" | "assignment";
  sortOrder: number;
  prerequisiteLessonId: string | null;
  quizId: string | null;
  assignmentId: string | null;
  isRequiredForCompletion: boolean;
  thumbnailPath: string | null;
  contentImportId: string | null;
  thumbnailAssetKey: string | null;
  thumbnailApprovedPath: string | null;
  thumbnailApprovedSha256: string | null;
  blocks: ContentBlock[];
};

export type LearnerOutlineModule = {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  lessons: LearnerOutlineLesson[];
};

export type LearnerOutlineCourse = {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  thumbnailPath: string | null;
  contentImportId: string | null;
  thumbnailAssetKey: string | null;
  thumbnailApprovedPath: string | null;
  thumbnailApprovedSha256: string | null;
  modules: LearnerOutlineModule[];
};

export type LearnerOutlineBuildInput = {
  course: LearnerOutlineCourse;
  states: Map<string, { lessonId: string; isComplete: boolean; isUnlocked: boolean }>;
  assignmentSubmissions: Map<string, "submitted" | "approved" | "needs_revision">;
  completedBlockIds: Set<string>;
  resume: { lastLessonId: string | null; lastBlockId: string | null } | null;
};

export type LearnerTileState =
  | "complete"
  | "current"
  | "open"
  | "locked"
  | "awaiting_review"
  | "needs_revision";

type TileBase = {
  id: string;
  title: string;
  description: string | null;
  moduleId: string;
  moduleTitle: string;
  lessonNumber: number;
  complete: boolean;
  unlocked: boolean;
  state: LearnerTileState;
  href: string;
  blocks: ContentBlock[];
  thumbnailPath: string | null;
  contentImportId: string | null;
  thumbnailAssetKey: string | null;
  thumbnailApprovedPath: string | null;
  thumbnailApprovedSha256: string | null;
  thumbnailUrl?: string;
};

export type LearnerContentTile = TileBase & {
  kind: "content";
  pairedQuizLessonId: string;
  quizId: string;
  contentComplete: boolean;
  quizComplete: boolean;
  quizUnlocked: boolean;
  completedBlockIds: Set<string>;
};

export type LearnerAssignmentTile = TileBase & {
  kind: "assignment";
  assignmentId: string;
  submissionStatus: "submitted" | "approved" | "needs_revision" | null;
};

export type LearnerCourseTile = LearnerContentTile | LearnerAssignmentTile;

export type LearnerCourseOutline = {
  course: LearnerOutlineCourse;
  modules: Array<{
    id: string;
    title: string;
    description: string | null;
    tiles: LearnerCourseTile[];
  }>;
  tiles: LearnerCourseTile[];
  completedCount: number;
  totalCount: number;
  completionPercent: number;
  resume: { href: string; label: string; tileId: string } | null;
};

export type LearnerOutlineResult =
  | { ok: true; outline: LearnerCourseOutline }
  | { ok: false; error: string };

export function buildLearnerCourseOutline(
  input: LearnerOutlineBuildInput,
): LearnerOutlineResult {
  const modules = [...input.course.modules]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((module) => ({
      ...module,
      lessons: [...module.lessons].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
      ),
    }));
  const lessonModule = new Map<string, LearnerOutlineModule>();
  const allLessons: LearnerOutlineLesson[] = [];
  for (const courseModule of modules) {
    for (const lesson of courseModule.lessons) {
      if (lessonModule.has(lesson.id)) {
        return { ok: false, error: `Duplicate lesson ${lesson.id} in course outline.` };
      }
      lessonModule.set(lesson.id, courseModule);
      allLessons.push(lesson);
    }
  }

  const dependentQuizzes = new Map<string, LearnerOutlineLesson[]>();
  for (const lesson of allLessons) {
    if (lesson.lessonType !== "quiz") continue;
    if (!lesson.prerequisiteLessonId) {
      return { ok: false, error: `Orphan quiz ${lesson.id} has no content prerequisite.` };
    }
    const candidates = dependentQuizzes.get(lesson.prerequisiteLessonId) ?? [];
    candidates.push(lesson);
    dependentQuizzes.set(lesson.prerequisiteLessonId, candidates);
  }

  const consumedQuizIds = new Set<string>();
  const tiles: LearnerCourseTile[] = [];
  for (const courseModule of modules) {
    for (const lesson of courseModule.lessons) {
      if (lesson.lessonType === "quiz") continue;
      const state = input.states.get(lesson.id);
      const unlocked = state?.isUnlocked === true;
      if (lesson.lessonType === "content") {
        const quizzes = dependentQuizzes.get(lesson.id) ?? [];
        if (quizzes.length !== 1) {
          return {
            ok: false,
            error: `Content lesson ${lesson.id} requires exactly one dependent quiz; found ${quizzes.length}.`,
          };
        }
        const quiz = quizzes[0];
        if (!quiz.quizId) {
          return { ok: false, error: `Paired quiz ${quiz.id} has no quiz record.` };
        }
        if (lessonModule.get(quiz.id)?.id !== courseModule.id) {
          return {
            ok: false,
            error: `Paired quiz ${quiz.id} must be in the same module as ${lesson.id}.`,
          };
        }
        consumedQuizIds.add(quiz.id);
        const quizState = input.states.get(quiz.id);
        const contentComplete = state?.isComplete === true;
        const quizComplete = quizState?.isComplete === true;
        const complete = contentComplete && quizComplete;
        tiles.push({
          kind: "content",
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          moduleId: courseModule.id,
          moduleTitle: courseModule.title,
          lessonNumber: tiles.length + 1,
          complete,
          unlocked,
          state: complete ? "complete" : unlocked ? "open" : "locked",
          href: `/lessons/${lesson.id}`,
          blocks: lesson.blocks,
          thumbnailPath: lesson.thumbnailPath,
          contentImportId: lesson.contentImportId,
          thumbnailAssetKey: lesson.thumbnailAssetKey,
          thumbnailApprovedPath: lesson.thumbnailApprovedPath,
          thumbnailApprovedSha256: lesson.thumbnailApprovedSha256,
          pairedQuizLessonId: quiz.id,
          quizId: quiz.quizId,
          contentComplete,
          quizComplete,
          quizUnlocked: quizState?.isUnlocked === true,
          completedBlockIds: new Set(
            lesson.blocks
              .filter((block) => input.completedBlockIds.has(block.id))
              .map((block) => block.id),
          ),
        });
        continue;
      }

      if (!lesson.assignmentId) {
        return { ok: false, error: `Assignment lesson ${lesson.id} has no assignment record.` };
      }
      const submissionStatus = input.assignmentSubmissions.get(lesson.id) ?? null;
      const complete = state?.isComplete === true || submissionStatus === "approved";
      let tileState: LearnerTileState = complete
        ? "complete"
        : unlocked
          ? "open"
          : "locked";
      if (!complete && unlocked && submissionStatus === "submitted") {
        tileState = "awaiting_review";
      } else if (!complete && unlocked && submissionStatus === "needs_revision") {
        tileState = "needs_revision";
      }
      tiles.push({
        kind: "assignment",
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        moduleId: courseModule.id,
        moduleTitle: courseModule.title,
        lessonNumber: tiles.length + 1,
        complete,
        unlocked,
        state: tileState,
        href: `/lessons/${lesson.id}`,
        blocks: lesson.blocks,
        thumbnailPath: lesson.thumbnailPath,
        contentImportId: lesson.contentImportId,
        thumbnailAssetKey: lesson.thumbnailAssetKey,
        thumbnailApprovedPath: lesson.thumbnailApprovedPath,
        thumbnailApprovedSha256: lesson.thumbnailApprovedSha256,
        assignmentId: lesson.assignmentId,
        submissionStatus,
      });
    }
  }

  const orphan = allLessons.find(
    (lesson) => lesson.lessonType === "quiz" && !consumedQuizIds.has(lesson.id),
  );
  if (orphan) {
    return { ok: false, error: `Orphan quiz ${orphan.id} is not paired to course content.` };
  }

  const currentIndex = tiles.findIndex((tile) => !tile.complete && tile.unlocked);
  if (currentIndex >= 0 && tiles[currentIndex].state === "open") {
    tiles[currentIndex] = { ...tiles[currentIndex], state: "current" };
  }
  const groupedModules = modules.map((courseModule) => ({
    id: courseModule.id,
    title: courseModule.title,
    description: courseModule.description,
    tiles: tiles.filter((tile) => tile.moduleId === courseModule.id),
  }));
  const completedCount = tiles.filter((tile) => tile.complete).length;
  const current = currentIndex >= 0 ? tiles[currentIndex] : null;

  return {
    ok: true,
    outline: {
      course: input.course,
      modules: groupedModules,
      tiles,
      completedCount,
      totalCount: tiles.length,
      completionPercent:
        tiles.length === 0 ? 0 : Math.round((completedCount / tiles.length) * 100),
      resume: current ? resolveResume(current, tiles, input.resume) : null,
    },
  };
}

function resolveResume(
  current: LearnerCourseTile,
  tiles: LearnerCourseTile[],
  resume: LearnerOutlineBuildInput["resume"],
): LearnerCourseOutline["resume"] {
  const statusLabel =
    current.state === "needs_revision"
      ? "Review needed"
      : current.state === "awaiting_review"
        ? "Awaiting review"
        : "Continue learning";
  if (current.state === "needs_revision" || current.state === "awaiting_review") {
    return { href: current.href, label: statusLabel, tileId: current.id };
  }

  if (resume?.lastLessonId) {
    const direct = tiles.find((tile) => tile.id === resume.lastLessonId);
    if (direct?.id === current.id) {
      const mappedPart =
        direct.kind === "content"
          ? partIdForBlock(direct.blocks, resume.lastBlockId) ??
            firstActionablePartId(direct.blocks)
          : null;
      const part =
        mappedPart === "guide" && direct.kind === "content" && !direct.complete
          ? direct.contentComplete && direct.quizUnlocked
            ? "quiz"
            : firstActionablePartId(direct.blocks)
          : mappedPart;
      return {
        href: part ? `${direct.href}?part=${encodeURIComponent(part)}` : direct.href,
        label: statusLabel,
        tileId: direct.id,
      };
    }
    const quizParent = tiles.find(
      (tile): tile is LearnerContentTile =>
        tile.kind === "content" && tile.pairedQuizLessonId === resume.lastLessonId,
    );
    if (quizParent?.id === current.id && quizParent.quizUnlocked) {
      return {
        href: `${quizParent.href}?part=quiz`,
        label: statusLabel,
        tileId: quizParent.id,
      };
    }
  }

  if (!resume?.lastLessonId && resume?.lastBlockId) {
    const blockParent = tiles.find(
      (tile): tile is LearnerContentTile =>
        tile.kind === "content" &&
        tile.blocks.some((block) => block.id === resume.lastBlockId),
    );
    if (blockParent?.id === current.id) {
      const mapped = partIdForBlock(blockParent.blocks, resume.lastBlockId);
      const part =
        mapped === "guide" && !blockParent.complete
          ? blockParent.contentComplete && blockParent.quizUnlocked
            ? "quiz"
            : firstActionablePartId(blockParent.blocks)
          : mapped ?? firstActionablePartId(blockParent.blocks);
      return {
        href: `${blockParent.href}?part=${encodeURIComponent(part)}`,
        label: statusLabel,
        tileId: blockParent.id,
      };
    }
  }

  if (current.kind === "content") {
    const part =
      current.contentComplete && current.quizUnlocked
        ? "quiz"
        : firstActionablePartId(current.blocks);
    return {
      href: `${current.href}?part=${encodeURIComponent(part)}`,
      label: statusLabel,
      tileId: current.id,
    };
  }
  return { href: current.href, label: statusLabel, tileId: current.id };
}
