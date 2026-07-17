import { createHash } from "node:crypto";

import type {
  CourseImportAsset,
  CourseImportManifest,
  ImportBlock,
  ImportLesson,
} from "./manifest";
import {
  artworkMimeMatchesPath,
  importArtworkNamespace,
  importStoragePrefix,
} from "@/lib/artwork/paths";
import { sanitizeTextBlockHtml } from "@/lib/sanitize/text-block";

export type ImportTable =
  | "role_groups"
  | "programs"
  | "courses"
  | "program_courses"
  | "modules"
  | "quizzes"
  | "assignments"
  | "lessons"
  | "content_blocks"
  | "questions"
  | "answer_options"
  | "program_access";

export type ImportOperation = {
  table: ImportTable;
  action: "upsert";
  sourceKey: string;
  id: string;
  row: Record<string, unknown>;
};

export type ImportPlan = {
  importId: string;
  operations: ImportOperation[];
  assets: CourseImportAsset[];
  summary: {
    programs: number;
    courses: number;
    modules: number;
    lessons: number;
    blocks: number;
    quizzes: number;
    questions: number;
    assignments: number;
    assets: number;
  };
};

export function deterministicImportId(importId: string, sourceKey: string): string {
  const hex = createHash("sha256").update(`${importId}:${sourceKey}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function buildImportPlan(manifest: CourseImportManifest): ImportPlan {
  const operations: ImportOperation[] = [];
  const id = (key: string) => deterministicImportId(manifest.import_id, key);
  const assets = new Map(manifest.assets.map((asset) => [asset.source_key, asset]));
  const assetsByPath = new Map<string, CourseImportAsset[]>();
  for (const asset of manifest.assets) {
    assetsByPath.set(asset.storage_path, [
      ...(assetsByPath.get(asset.storage_path) ?? []),
      asset,
    ]);
  }
  const add = (table: ImportTable, sourceKey: string, row: Record<string, unknown>) => {
    const rowId = id(sourceKey);
    operations.push({
      table,
      action: "upsert",
      sourceKey,
      id: rowId,
      row: { id: rowId, ...row },
    });
    return rowId;
  };

  const roleGroupId = add("role_groups", manifest.qa_role_group.source_key, {
    name: manifest.qa_role_group.name,
    description: manifest.qa_role_group.description,
  });
  const program = manifest.program;
  const programArtwork = resolveThumbnailProvenance(
    program.thumbnail_asset_key,
    assets,
    manifest.import_id,
  );
  const programId = add("programs", program.source_key, {
    title: program.title,
    description: program.description,
    content_import_id: manifest.import_id,
    ...programArtwork,
    is_published: false,
    course_order_mode: program.course_order_mode,
    certificate_enabled: program.certificate_enabled,
  });

  let modules = 0;
  let lessons = 0;
  let blocks = 0;
  let quizzes = 0;
  let questions = 0;
  let assignments = 0;

  for (const [courseIndex, course] of program.courses.entries()) {
    const courseArtwork = resolveThumbnailProvenance(
      course.thumbnail_asset_key,
      assets,
      manifest.import_id,
    );
    const courseId = add("courses", course.source_key, {
      title: course.title,
      description: course.description,
      content_import_id: manifest.import_id,
      ...courseArtwork,
      is_published: false,
      certificate_enabled: course.certificate_enabled,
      sort_order: courseIndex,
    });
    add("program_courses", `${program.source_key}:${course.source_key}`, {
      program_id: programId,
      course_id: courseId,
      sort_order: courseIndex,
    });

    let previousLessonId: string | null = null;
    for (const courseModule of sortedBySortOrder(course.modules, "module")) {
      modules += 1;
      const moduleId = add("modules", courseModule.source_key, {
        course_id: courseId,
        title: courseModule.title,
        description: courseModule.description,
        sort_order: courseModule.sort_order,
      });
      for (const lesson of sortedBySortOrder(courseModule.lessons, "lesson")) {
        lessons += 1;
        const backing = addBackingRecord(lesson, add);
        if (lesson.quiz) quizzes += 1;
        if (lesson.assignment) assignments += 1;
        const lessonArtwork = resolveThumbnailProvenance(
          lesson.thumbnail_asset_key,
          assets,
          manifest.import_id,
        );
        const lessonId = add("lessons", lesson.source_key, {
          module_id: moduleId,
          title: lesson.title,
          description: lesson.description,
          content_import_id: manifest.import_id,
          lesson_type: lesson.type,
          quiz_id: backing.quizId,
          assignment_id: backing.assignmentId,
          prerequisite_lesson_id: previousLessonId,
          is_required_for_completion: lesson.required,
          sort_order: lesson.sort_order,
          ...lessonArtwork,
        });
        previousLessonId = lessonId;

        for (const block of lesson.blocks ?? []) {
          blocks += 1;
          add("content_blocks", block.source_key, {
            lesson_id: lessonId,
            block_type: block.type,
            content: resolveBlockContent(
              block,
              assets,
              assetsByPath,
              manifest.import_id,
            ),
            sort_order: block.sort_order,
            is_required_for_completion: block.required,
          });
        }
        for (const question of lesson.quiz?.questions ?? []) {
          questions += 1;
          const questionId = add("questions", question.source_key, {
            quiz_id: backing.quizId,
            question_text: question.question_text,
            question_type: question.question_type,
            explanation: question.explanation,
            points: question.points,
            sort_order: question.sort_order,
          });
          for (const option of question.options) {
            add("answer_options", option.source_key, {
              question_id: questionId,
              option_text: option.option_text,
              is_correct: option.is_correct,
              sort_order: option.sort_order,
            });
          }
        }
      }
    }
  }

  add("program_access", `${program.source_key}:${manifest.qa_role_group.source_key}`, {
    program_id: programId,
    role_group_id: roleGroupId,
  });

  return {
    importId: manifest.import_id,
    operations,
    assets: manifest.assets,
    summary: {
      programs: 1,
      courses: program.courses.length,
      modules,
      lessons,
      blocks,
      quizzes,
      questions,
      assignments,
      assets: manifest.assets.length,
    },
  };
}

function sortedBySortOrder<T extends { sort_order: number }>(
  items: T[],
  label: "module" | "lesson",
): T[] {
  const seen = new Set<number>();
  for (const item of items) {
    if (seen.has(item.sort_order)) {
      throw new Error(`Cannot construct prerequisites with duplicate ${label} sort_order ${item.sort_order}.`);
    }
    seen.add(item.sort_order);
  }
  return [...items].sort((left, right) => left.sort_order - right.sort_order);
}

function addBackingRecord(
  lesson: ImportLesson,
  add: (table: ImportTable, sourceKey: string, row: Record<string, unknown>) => string,
) {
  let quizId: string | null = null;
  let assignmentId: string | null = null;
  if (lesson.quiz) {
    const quiz = lesson.quiz;
    quizId = add("quizzes", quiz.source_key, {
      title: quiz.title,
      description: quiz.description,
      passing_score: quiz.passing_score,
      randomize_questions: quiz.randomize_questions,
      randomize_answers: quiz.randomize_answers,
      questions_per_attempt: quiz.questions_per_attempt,
      max_attempts: quiz.max_attempts,
      retake_cooldown_hours: quiz.retake_cooldown_hours,
      show_correct_answers_after: quiz.show_correct_answers_after,
    });
  }
  if (lesson.assignment) {
    const assignment = lesson.assignment;
    assignmentId = add("assignments", assignment.source_key, {
      title: assignment.title,
      instructions: assignment.instructions,
      submission_type: assignment.submission_type,
      requires_review: assignment.requires_review,
      rubric: assignment.rubric,
    });
  }
  return { quizId, assignmentId };
}

function resolveThumbnailProvenance(
  key: string | null,
  assets: Map<string, CourseImportAsset>,
  importId: string,
) {
  const empty = {
    thumbnail_path: null,
    thumbnail_asset_key: null,
    thumbnail_approved_path: null,
    thumbnail_approved_sha256: null,
  };
  if (!key) return empty;
  const asset = assets.get(key);
  const prefix = importStoragePrefix(importId);
  if (
    !asset ||
    !prefix ||
    asset.approval_status !== "approved" ||
    !isImmutableApprovedAsset(asset, prefix) ||
    (asset.kind !== "image" && asset.kind !== "thumbnail") ||
    !artworkMimeMatchesPath(asset.storage_path, asset.mime_type) ||
    !asset.storage_path.startsWith(importArtworkNamespace(prefix))
  ) {
    return empty;
  }
  return {
    thumbnail_path: asset.storage_path,
    thumbnail_asset_key: asset.source_key,
    thumbnail_approved_path: asset.storage_path,
    thumbnail_approved_sha256: asset.checksum_sha256,
  };
}

function resolveBlockContent(
  block: ImportBlock,
  assets: Map<string, CourseImportAsset>,
  assetsByPath: Map<string, CourseImportAsset[]>,
  importId: string,
) {
  const content = { ...block.content };
  if (block.type === "text" && typeof content.html === "string") {
    content.html = sanitizeTextBlockHtml(content.html);
  }
  const mappings = [
    ["asset_key", "file_path"],
    ["poster_asset_key", "poster_path"],
    ["caption_asset_key", "caption_path"],
    ["transcript_asset_key", "transcript_path"],
  ] as const;
  for (const [keyField, pathField] of mappings) {
    const key = content[keyField];
    const rawPath = content[pathField];
    if (typeof key === "string") {
      const asset = assets.get(key);
      if (typeof rawPath === "string" && rawPath !== asset?.storage_path) {
        throw new Error(`${block.source_key}.${pathField} does not match ${keyField} ${key}.`);
      }
      if (typeof rawPath === "string") {
        const prefix = importStoragePrefix(importId);
        if (!asset || !prefix || !isImmutableApprovedAsset(asset, prefix)) {
          throw new Error(
            `${block.source_key}.${pathField} must exactly match one approved immutable asset in this import.`,
          );
        }
      }
      content[pathField] = asset?.storage_path ?? null;
    } else if (typeof rawPath === "string") {
      const matches = assetsByPath.get(rawPath) ?? [];
      const prefix = importStoragePrefix(importId);
      if (
        matches.length !== 1 ||
        !prefix ||
        !isImmutableApprovedAsset(matches[0], prefix)
      ) {
        throw new Error(
          `${block.source_key}.${pathField} must exactly match one approved immutable asset in this import.`,
        );
      }
      content[pathField] = matches[0].storage_path;
    } else if (rawPath !== undefined && rawPath !== null) {
      throw new Error(`${block.source_key}.${pathField} must be a string.`);
    }
    delete content[keyField];
  }
  return content;
}

function isImmutableApprovedAsset(asset: CourseImportAsset, prefix: string): boolean {
  return (
    asset.approval_status === "approved" &&
    typeof asset.checksum_sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(asset.checksum_sha256) &&
    Number.isInteger(asset.size_bytes) &&
    Number(asset.size_bytes) >= 0 &&
    asset.storage_path.startsWith(prefix) &&
    asset.storage_path.includes(asset.checksum_sha256)
  );
}
