import {
  artworkMimeMatchesPath,
  importArtworkNamespace,
  parseArtworkPath,
} from "@/lib/artwork/paths";
import {
  MAX_ASSIGNMENT_INSTRUCTIONS_LENGTH,
  MAX_ASSIGNMENT_TITLE_LENGTH,
  isAssignmentSubmissionType,
} from "@/lib/assignments/validation";
import { parseAssignmentRubric } from "@/lib/assignments/rubric";

export type ApprovalStatus = "approved" | "hold" | "missing";
export type AssetKind =
  | "video"
  | "audio"
  | "image"
  | "thumbnail"
  | "poster"
  | "caption"
  | "transcript"
  | "pdf"
  | "download";

export type CourseImportAsset = {
  source_key: string;
  kind: AssetKind;
  local_path: string;
  storage_path: string;
  mime_type: string;
  checksum_sha256: string | null;
  size_bytes: number | null;
  approval_status: ApprovalStatus;
};

export type ImportBlock = {
  source_key: string;
  type:
    | "video"
    | "text"
    | "pdf"
    | "image"
    | "audio"
    | "download"
    | "external_link"
    | "embed"
    | "role_play"
    | "divider"
    | "callout"
    | "flashcard";
  sort_order: number;
  required: boolean;
  content: Record<string, unknown>;
};

export type ImportQuiz = {
  source_key: string;
  title: string;
  description: string | null;
  passing_score: number;
  randomize_questions: boolean;
  randomize_answers: boolean;
  questions_per_attempt: number | null;
  max_attempts: number | null;
  retake_cooldown_hours: number;
  show_correct_answers_after: "never" | "after_pass" | "always";
  questions: Array<{
    source_key: string;
    question_text: string;
    question_type: "true_false" | "single_choice" | "multi_select";
    explanation: string | null;
    points: number;
    sort_order: number;
    options: Array<{
      source_key: string;
      option_text: string;
      is_correct: boolean;
      sort_order: number;
    }>;
  }>;
};

export type ImportAssignment = {
  source_key: string;
  title: string;
  instructions: string;
  submission_type: "text" | "file_upload" | "url";
  requires_review: boolean;
  rubric: Array<{ criterion: string; description: string }>;
};

export type ImportLesson = {
  source_key: string;
  title: string;
  description: string | null;
  type: "content" | "quiz" | "assignment";
  sort_order: number;
  required: boolean;
  thumbnail_asset_key: string | null;
  blocks?: ImportBlock[];
  quiz?: ImportQuiz;
  assignment?: ImportAssignment;
};

export type CourseImportManifest = {
  schema_version: 1;
  import_id: string;
  status: "draft";
  qa_role_group: {
    source_key: string;
    name: string;
    description: string;
  };
  assets: CourseImportAsset[];
  program: {
    source_key: string;
    title: string;
    description: string | null;
    thumbnail_asset_key: string | null;
    is_published: false;
    course_order_mode: "sequential" | "free";
    certificate_enabled: boolean;
    courses: Array<{
      source_key: string;
      title: string;
      description: string | null;
      thumbnail_asset_key: string | null;
      is_published: false;
      certificate_enabled: boolean;
      modules: Array<{
        source_key: string;
        title: string;
        description: string | null;
        sort_order: number;
        lessons: ImportLesson[];
      }>;
    }>;
  };
};

export type ManifestValidationResult =
  | { ok: true; value: CourseImportManifest }
  | { ok: false; errors: string[] };

export type ManifestValidationOptions = { gate?: "draft" | "release" };

export function validateCanaryScope(manifest: CourseImportManifest): string[] {
  const errors: string[] = [];
  const courses = manifest.program.courses;
  const modules = courses.flatMap((course) => course.modules);
  const lessons = modules.flatMap((courseModule) => courseModule.lessons);
  const techStackLessons = lessons.filter(
    (lesson) =>
      lesson.type === "content" &&
      `${lesson.source_key} ${lesson.title}`.toLowerCase().includes("tech stack"),
  );
  if (!manifest.import_id.includes("canary")) errors.push("Canary import_id must include canary.");
  if (courses.length !== 1) errors.push("Canary manifest must contain exactly one course.");
  if (modules.length !== 1) errors.push("Canary manifest must contain exactly one module.");
  if (lessons.length < 1 || lessons.length > 2) errors.push("Canary manifest must contain one content lesson and at most its quiz.");
  if (techStackLessons.length !== 1) errors.push("Canary manifest must contain exactly one Tech Stack content lesson.");
  if (manifest.assets.length > 10) errors.push("Canary manifest must contain only the assets needed by the Tech Stack slice.");
  return errors;
}

const MAX_IMPORT_ID_LENGTH = 128;
const MAX_SOURCE_KEY_LENGTH = 512;
const SOURCE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ASSET_REFERENCE_FIELDS = [
  "asset_key",
  "poster_asset_key",
  "caption_asset_key",
  "transcript_asset_key",
] as const;
const RESOLVED_ASSET_REFERENCE_FIELDS = [
  ["asset_key", "file_path"],
  ["poster_asset_key", "poster_path"],
  ["caption_asset_key", "caption_path"],
  ["transcript_asset_key", "transcript_path"],
] as const;

export function validateCourseManifest(
  input: unknown,
  options: ManifestValidationOptions = {},
): ManifestValidationResult {
  const gate = options.gate ?? "draft";
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["Manifest must be an object."] };

  if (input.schema_version !== 1) errors.push("schema_version must be 1.");
  if (input.status !== "draft") errors.push("status must be draft.");
  requireString(input, "import_id", "import_id", errors);
  if (
    typeof input.import_id === "string" &&
    (!SOURCE_KEY_PATTERN.test(input.import_id) || input.import_id.length > MAX_IMPORT_ID_LENGTH)
  ) {
    errors.push(
      `import_id must be at most ${MAX_IMPORT_ID_LENGTH} characters and use lowercase letters, numbers, dots, underscores, or hyphens.`,
    );
  }
  if (!isRecord(input.qa_role_group)) errors.push("qa_role_group must be an object.");
  if (!Array.isArray(input.assets)) errors.push("assets must be an array.");
  if (!isRecord(input.program)) errors.push("program must be an object.");
  if (errors.length > 0) return { ok: false, errors };

  const manifest = input as unknown as CourseImportManifest;
  const storagePrefix = storagePrefixForImport(manifest.import_id);
  const artworkNamespace = importArtworkNamespace(storagePrefix);
  const seenKeys = new Map<string, string>();
  const registerKey = (value: unknown, path: string) => {
    if (
      typeof value !== "string" ||
      value.length > MAX_SOURCE_KEY_LENGTH ||
      !SOURCE_KEY_PATTERN.test(value)
    ) {
      errors.push(`${path}.source_key must be at most ${MAX_SOURCE_KEY_LENGTH} characters and use lowercase letters, numbers, dots, underscores, or hyphens.`);
      return;
    }
    const prior = seenKeys.get(value);
    if (prior) errors.push(`Duplicate source_key ${value} at ${path}; first used at ${prior}.`);
    else seenKeys.set(value, path);
  };

  registerKey(manifest.qa_role_group.source_key, "qa_role_group");
  requireNonEmpty(manifest.qa_role_group.name, "qa_role_group.name", errors);
  const assets = new Map<string, CourseImportAsset>();
  const assetPaths = new Map<string, CourseImportAsset[]>();
  for (const [index, asset] of manifest.assets.entries()) {
    const path = `assets[${index}]`;
    if (!isRecord(asset)) {
      errors.push(`${path} must be an object.`);
      continue;
    }
    registerKey(asset.source_key, path);
    requireNonEmpty(asset.local_path, `${path}.local_path`, errors);
    validateStoragePath(asset.storage_path, `${path}.storage_path`, errors);
    requireNonEmpty(asset.mime_type, `${path}.mime_type`, errors);
    if (asset.checksum_sha256 !== null && !SHA256_PATTERN.test(asset.checksum_sha256)) {
      errors.push(`${path}.checksum_sha256 must be a lowercase SHA-256 hex digest or null.`);
    }
    if (asset.size_bytes !== null && (!Number.isInteger(asset.size_bytes) || asset.size_bytes < 0)) {
      errors.push(`${path}.size_bytes must be a non-negative integer or null.`);
    }
    if (!["approved", "hold", "missing"].includes(asset.approval_status)) {
      errors.push(`${path}.approval_status is invalid.`);
    }
    if (
      typeof asset.storage_path !== "string" ||
      !asset.storage_path.startsWith(storagePrefix)
    ) {
      errors.push(`${path}.storage_path must be owned by ${storagePrefix}.`);
    }
    if (gate === "release") {
      if (asset.approval_status === "approved") {
        if (!asset.checksum_sha256) {
          errors.push(`${path}.checksum_sha256 is required for an approved release asset.`);
        } else if (!asset.storage_path.includes(asset.checksum_sha256)) {
          errors.push(`${path}.storage_path must include its SHA-256 checksum for immutable release storage.`);
        }
        if (!Number.isInteger(asset.size_bytes) || Number(asset.size_bytes) < 0) {
          errors.push(`${path}.size_bytes is required for an approved release asset.`);
        }
      }
    }
    if (typeof asset.source_key === "string") assets.set(asset.source_key, asset as CourseImportAsset);
    if (typeof asset.storage_path === "string") {
      assetPaths.set(asset.storage_path, [
        ...(assetPaths.get(asset.storage_path) ?? []),
        asset as CourseImportAsset,
      ]);
    }
  }
  for (const [storagePath, matches] of assetPaths) {
    if (matches.length > 1) {
      errors.push(`Asset storage_path ${storagePath} is used by more than one asset.`);
    }
  }

  const program = manifest.program;
  registerKey(program.source_key, "program");
  validateDerivedSourceKey(
    `${program.source_key}:${manifest.qa_role_group.source_key}`,
    "program_access",
    errors,
  );
  requireNonEmpty(program.title, "program.title", errors);
  if (program.is_published !== false) errors.push("program.is_published must be false for a safe import.");
  validateArtworkReference(
    program.thumbnail_asset_key,
    "program.thumbnail_asset_key",
    assets,
    artworkNamespace,
    gate,
    errors,
  );
  if (!Array.isArray(program.courses) || program.courses.length === 0) {
    errors.push("program.courses must contain at least one course.");
  } else {
    for (const [courseIndex, course] of program.courses.entries()) {
      const coursePath = `program.courses[${courseIndex}]`;
      registerKey(course.source_key, coursePath);
      validateDerivedSourceKey(
        `${program.source_key}:${course.source_key}`,
        `${coursePath}.program_course`,
        errors,
      );
      requireNonEmpty(course.title, `${coursePath}.title`, errors);
      if (course.is_published !== false) errors.push(`${coursePath}.is_published must be false for a safe import.`);
      validateArtworkReference(
        course.thumbnail_asset_key,
        `${coursePath}.thumbnail_asset_key`,
        assets,
        artworkNamespace,
        gate,
        errors,
      );
      validateSiblingSortOrders(course.modules, `${coursePath}.modules`, errors);
      for (const [moduleIndex, module] of (course.modules ?? []).entries()) {
        const modulePath = `${coursePath}.modules[${moduleIndex}]`;
        registerKey(module.source_key, modulePath);
        requireNonEmpty(module.title, `${modulePath}.title`, errors);
        validateSiblingSortOrders(module.lessons, `${modulePath}.lessons`, errors);
        for (const [lessonIndex, lesson] of (module.lessons ?? []).entries()) {
          validateLesson(
            lesson,
            `${modulePath}.lessons[${lessonIndex}]`,
            assets,
            assetPaths,
            artworkNamespace,
            registerKey,
            gate,
            errors,
          );
        }
      }
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: manifest };
}

function validateDerivedSourceKey(value: string, path: string, errors: string[]) {
  if (value.length > MAX_SOURCE_KEY_LENGTH) {
    errors.push(
      `${path} derived source_key must be at most ${MAX_SOURCE_KEY_LENGTH} characters for rollback.`,
    );
  }
}

function validateLesson(
  lesson: ImportLesson,
  path: string,
  assets: Map<string, CourseImportAsset>,
  assetPaths: Map<string, CourseImportAsset[]>,
  artworkNamespace: string,
  registerKey: (value: unknown, path: string) => void,
  gate: "draft" | "release",
  errors: string[],
) {
  if (!isRecord(lesson)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  registerKey(lesson.source_key, path);
  requireNonEmpty(lesson.title, `${path}.title`, errors);
  validateArtworkReference(
    lesson.thumbnail_asset_key,
    `${path}.thumbnail_asset_key`,
    assets,
    artworkNamespace,
    gate,
    errors,
  );

  if (lesson.type === "content") {
    if (lesson.quiz || lesson.assignment) errors.push(`${path} content lesson cannot include quiz or assignment data.`);
    if (!Array.isArray(lesson.blocks) || lesson.blocks.length === 0) errors.push(`${path}.blocks must contain at least one block.`);
    validateSiblingSortOrders(lesson.blocks ?? [], `${path}.blocks`, errors);
    for (const [index, block] of (lesson.blocks ?? []).entries()) {
      const blockPath = `${path}.blocks[${index}]`;
      registerKey(block.source_key, blockPath);
      if (!isRecord(block.content)) errors.push(`${blockPath}.content must be an object.`);
      for (const field of ASSET_REFERENCE_FIELDS) {
        const value = block.content?.[field];
        if (value !== undefined && value !== null) {
          validateAssetReference(value, `${blockPath}.content.${field}`, assets, errors);
          const asset = typeof value === "string" ? assets.get(value) : undefined;
          if (gate === "release" && asset && asset.approval_status !== "approved") {
            errors.push(`${blockPath} referenced asset ${value} is not approved.`);
          }
        }
      }
      for (const [keyField, pathField] of RESOLVED_ASSET_REFERENCE_FIELDS) {
        const rawPath = block.content?.[pathField];
        if (rawPath === undefined || rawPath === null) continue;
        if (typeof rawPath !== "string") {
          errors.push(`${blockPath}.content.${pathField} must be a string.`);
          continue;
        }
        const matches = assetPaths.get(rawPath) ?? [];
        if (matches.length !== 1) {
          errors.push(
            `${blockPath}.content.${pathField} must exactly match one manifest asset.`,
          );
          continue;
        }
        const asset = matches[0];
        const key = block.content?.[keyField];
        if (typeof key === "string" && key !== asset.source_key) {
          errors.push(
            `${blockPath}.content.${pathField} does not match ${keyField} ${key}.`,
          );
        }
        if (gate === "release" && !isApprovedImmutableAsset(asset, storagePrefixForImportFromNamespace(artworkNamespace))) {
          errors.push(
            `${blockPath}.content.${pathField} must reference an approved immutable asset in this import.`,
          );
        }
      }
      if (gate === "release" && block.type === "video") {
        for (const field of ["asset_key", "poster_asset_key", "caption_asset_key", "transcript_asset_key"] as const) {
          const value = block.content?.[field];
          if (typeof value !== "string") errors.push(`${blockPath}.content.${field} is required for release.`);
          else requireApprovedAsset(value, `${blockPath}.content.${field}`, assets, errors);
        }
      }
      if (block.type === "flashcard") {
        const cards = block.content?.cards;
        if (!Array.isArray(cards) || cards.length === 0) errors.push(`${blockPath}.content.cards must contain at least one card.`);
      }
    }
  } else if (lesson.type === "quiz") {
    if (lesson.blocks || lesson.assignment || !lesson.quiz) errors.push(`${path} quiz lesson must contain only quiz data.`);
    if (lesson.quiz) validateQuiz(lesson.quiz, `${path}.quiz`, registerKey, gate, errors);
  } else if (lesson.type === "assignment") {
    if (lesson.blocks || lesson.quiz || !lesson.assignment) errors.push(`${path} assignment lesson must contain only assignment data.`);
    const assignment = lesson.assignment as unknown;
    if (assignment !== undefined && assignment !== null && !isRecord(assignment)) {
      errors.push(`${path}.assignment must be an object.`);
    } else if (isRecord(assignment)) {
      registerKey(assignment.source_key, `${path}.assignment`);
      validateBoundedString(
        assignment.title,
        `${path}.assignment.title`,
        MAX_ASSIGNMENT_TITLE_LENGTH,
        errors,
      );
      validateBoundedString(
        assignment.instructions,
        `${path}.assignment.instructions`,
        MAX_ASSIGNMENT_INSTRUCTIONS_LENGTH,
        errors,
      );
      if (!isAssignmentSubmissionType(assignment.submission_type)) {
        errors.push(`${path}.assignment.submission_type is invalid.`);
      }
      if (typeof assignment.requires_review !== "boolean") {
        errors.push(`${path}.assignment.requires_review must be boolean.`);
      }
      const rubric = parseAssignmentRubric(assignment.rubric);
      if (!rubric.ok) {
        errors.push(`${path}.assignment.rubric: ${rubric.error}`);
      } else if (rubric.items.length === 0) {
        errors.push(`${path}.assignment.rubric must contain at least one criterion.`);
      }
    }
  } else {
    errors.push(`${path}.type is invalid.`);
  }
}

function storagePrefixForImportFromNamespace(artworkNamespace: string): string {
  return artworkNamespace.endsWith("thumbnails/")
    ? artworkNamespace.slice(0, -"thumbnails/".length)
    : artworkNamespace;
}

function isApprovedImmutableAsset(asset: CourseImportAsset, storagePrefix: string): boolean {
  return (
    asset.approval_status === "approved" &&
    typeof asset.checksum_sha256 === "string" &&
    SHA256_PATTERN.test(asset.checksum_sha256) &&
    Number.isInteger(asset.size_bytes) &&
    Number(asset.size_bytes) >= 0 &&
    asset.storage_path.startsWith(storagePrefix) &&
    asset.storage_path.includes(asset.checksum_sha256)
  );
}

function validateQuiz(
  quiz: ImportQuiz,
  path: string,
  registerKey: (value: unknown, path: string) => void,
  gate: "draft" | "release",
  errors: string[],
) {
  registerKey(quiz.source_key, path);
  requireNonEmpty(quiz.title, `${path}.title`, errors);
  if (typeof quiz.randomize_questions !== "boolean") errors.push(`${path}.randomize_questions must be boolean.`);
  if (typeof quiz.randomize_answers !== "boolean") errors.push(`${path}.randomize_answers must be boolean.`);
  if (!Number.isInteger(quiz.passing_score) || quiz.passing_score < 0 || quiz.passing_score > 100) {
    errors.push(`${path}.passing_score must be an integer from 0 to 100.`);
  }
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) errors.push(`${path}.questions must contain at least one question.`);
  if (gate === "release" && (quiz.questions?.length ?? 0) < 15) errors.push(`${path}.questions must contain at least 15 questions for release.`);
  if (
    quiz.questions_per_attempt !== null &&
    (!Number.isInteger(quiz.questions_per_attempt) ||
      quiz.questions_per_attempt < 1 ||
      quiz.questions_per_attempt > (quiz.questions?.length ?? 0))
  ) {
    errors.push(`${path}.questions_per_attempt must be positive and no larger than the question pool.`);
  }
  if (quiz.max_attempts !== null && (!Number.isInteger(quiz.max_attempts) || quiz.max_attempts < 1)) {
    errors.push(`${path}.max_attempts must be a positive integer or null.`);
  }
  if (!Number.isInteger(quiz.retake_cooldown_hours) || quiz.retake_cooldown_hours < 0) {
    errors.push(`${path}.retake_cooldown_hours must be a non-negative integer.`);
  }
  if (!["never", "after_pass", "always"].includes(quiz.show_correct_answers_after)) {
    errors.push(`${path}.show_correct_answers_after is invalid.`);
  }
  validateSiblingSortOrders(quiz.questions ?? [], `${path}.questions`, errors);
  for (const [index, question] of (quiz.questions ?? []).entries()) {
    const questionPath = `${path}.questions[${index}]`;
    registerKey(question.source_key, questionPath);
    requireNonEmpty(question.question_text, `${questionPath}.question_text`, errors);
    if (!["true_false", "single_choice", "multi_select"].includes(question.question_type)) {
      errors.push(`${questionPath}.question_type is invalid.`);
    }
    if (!Number.isInteger(question.points) || question.points < 0) {
      errors.push(`${questionPath}.points must be a non-negative integer.`);
    }
    if (!Array.isArray(question.options) || question.options.length < 2) errors.push(`${questionPath}.options must contain at least two options.`);
    validateSiblingSortOrders(question.options ?? [], `${questionPath}.options`, errors);
    let correct = 0;
    for (const [optionIndex, option] of (question.options ?? []).entries()) {
      const optionPath = `${questionPath}.options[${optionIndex}]`;
      registerKey(option.source_key, optionPath);
      requireNonEmpty(option.option_text, `${optionPath}.option_text`, errors);
      if (typeof option.is_correct !== "boolean") errors.push(`${optionPath}.is_correct must be boolean.`);
      if (option.is_correct === true) correct += 1;
    }
    if (correct === 0) errors.push(`${questionPath} must have at least one correct option.`);
    if (question.question_type !== "multi_select" && correct !== 1) errors.push(`${questionPath} must have exactly one correct option.`);
  }
}

function requireApprovedAsset(
  value: unknown,
  path: string,
  assets: Map<string, CourseImportAsset>,
  errors: string[],
) {
  if (typeof value !== "string") {
    errors.push(`${path} is required for release.`);
    return;
  }
  const asset = assets.get(value);
  if (!asset) return;
  if (asset.approval_status !== "approved") errors.push(`${path} asset ${value} is not approved for release.`);
}

function validateAssetReference(
  value: unknown,
  path: string,
  assets: Map<string, CourseImportAsset>,
  errors: string[],
) {
  if (value === null || value === undefined) return;
  if (typeof value !== "string" || !assets.has(value)) errors.push(`${path} references missing asset ${String(value)}.`);
}

function validateStoragePath(value: unknown, path: string, errors: string[]) {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("..") || value.includes("://")) {
    errors.push(`${path} must be a relative storage object path.`);
  }
}

export function storagePrefixForImport(importId: string): string {
  const versioned = /^(.*)-v([0-9]+)$/.exec(importId);
  return versioned
    ? `courses/${versioned[1]}/v${versioned[2]}/`
    : `courses/${importId}/`;
}

function validateSiblingSortOrders(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  const seen = new Set<number>();
  for (const item of value) {
    const order = isRecord(item) ? item.sort_order : undefined;
    if (!Number.isInteger(order) || Number(order) < 0) errors.push(`${path} entries need non-negative integer sort_order values.`);
    else if (seen.has(Number(order))) errors.push(`${path} contains duplicate sort_order ${order}.`);
    else seen.add(Number(order));
  }
}

function requireString(value: Record<string, unknown>, key: string, path: string, errors: string[]) {
  requireNonEmpty(value[key], path, errors);
}

function requireNonEmpty(value: unknown, path: string, errors: string[]) {
  if (typeof value !== "string" || value.trim() === "") errors.push(`${path} is required.`);
}

function validateBoundedString(value: unknown, path: string, maxLength: number, errors: string[]) {
  requireNonEmpty(value, path, errors);
  if (typeof value === "string" && value.trim().length > maxLength) {
    errors.push(`${path} must be ${maxLength.toLocaleString()} characters or less.`);
  }
}

function validateArtworkReference(
  value: unknown,
  path: string,
  assets: Map<string, CourseImportAsset>,
  expectedNamespace: string,
  gate: "draft" | "release",
  errors: string[],
) {
  validateAssetReference(value, path, assets, errors);
  if (value === null) return;
  const asset = typeof value === "string" ? assets.get(value) : undefined;
  if (!asset) return;
  const parsed = parseArtworkPath(asset.storage_path);
  if (
    (asset.kind !== "image" && asset.kind !== "thumbnail") ||
    !artworkMimeMatchesPath(asset.storage_path, asset.mime_type) ||
    parsed?.namespace !== expectedNamespace
  ) {
    errors.push(`${path} must reference an image in ${expectedNamespace}.`);
  }
  if (gate === "release") requireApprovedAsset(value, path, assets, errors);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
