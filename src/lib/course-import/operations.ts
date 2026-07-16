import { createHash } from "node:crypto";

import type {
  CourseImportAsset,
  CourseImportManifest,
  ImportBlock,
  ImportLesson,
} from "./manifest";

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
  const add = (table: ImportTable, sourceKey: string, row: Record<string, unknown>) => {
    const rowId = id(sourceKey);
    operations.push({ table, action: "upsert", id: rowId, row: { id: rowId, ...row } });
    return rowId;
  };

  const roleGroupId = add("role_groups", manifest.qa_role_group.source_key, {
    name: manifest.qa_role_group.name,
    description: manifest.qa_role_group.description,
  });
  const program = manifest.program;
  const programId = add("programs", program.source_key, {
    title: program.title,
    description: program.description,
    content_import_id: manifest.import_id,
    thumbnail_path: resolveThumbnail(program.thumbnail_asset_key, assets),
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
    const courseId = add("courses", course.source_key, {
      title: course.title,
      description: course.description,
      content_import_id: manifest.import_id,
      thumbnail_path: resolveThumbnail(course.thumbnail_asset_key, assets),
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
    for (const courseModule of course.modules) {
      modules += 1;
      const moduleId = add("modules", courseModule.source_key, {
        course_id: courseId,
        title: courseModule.title,
        description: courseModule.description,
        sort_order: courseModule.sort_order,
      });
      for (const lesson of courseModule.lessons) {
        lessons += 1;
        const backing = addBackingRecord(lesson, add);
        if (lesson.quiz) quizzes += 1;
        if (lesson.assignment) assignments += 1;
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
          thumbnail_path: resolveThumbnail(lesson.thumbnail_asset_key, assets),
        });
        previousLessonId = lessonId;

        for (const block of lesson.blocks ?? []) {
          blocks += 1;
          add("content_blocks", block.source_key, {
            lesson_id: lessonId,
            block_type: block.type,
            content: resolveBlockContent(block, assets),
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

function resolveThumbnail(key: string | null, assets: Map<string, CourseImportAsset>) {
  return key ? assets.get(key)?.storage_path ?? null : null;
}

function resolveBlockContent(block: ImportBlock, assets: Map<string, CourseImportAsset>) {
  const content = { ...block.content };
  const mappings = [
    ["asset_key", "file_path"],
    ["poster_asset_key", "poster_path"],
    ["caption_asset_key", "caption_path"],
    ["transcript_asset_key", "transcript_path"],
  ] as const;
  for (const [keyField, pathField] of mappings) {
    const key = content[keyField];
    if (typeof key === "string") content[pathField] = assets.get(key)?.storage_path ?? null;
    delete content[keyField];
  }
  return content;
}
