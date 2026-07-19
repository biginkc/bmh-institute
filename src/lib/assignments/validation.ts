import { parseAssignmentRubric, type AssignmentRubricItem } from "./rubric";

export const MAX_ASSIGNMENT_TITLE_LENGTH = 200;
export const MAX_ASSIGNMENT_INSTRUCTIONS_LENGTH = 10_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBMISSION_TYPES = new Set(["file_upload", "text", "url"]);

export type AssignmentUpdateInput = {
  assignmentId: string;
  lessonId: string;
  title: string;
  instructions: string;
  submission_type: "file_upload" | "text" | "url";
  requires_review: boolean;
  rubric: AssignmentRubricItem[];
};

export type AssignmentUpdateParseResult =
  | { ok: true; value: AssignmentUpdateInput }
  | { ok: false; error: string };

export function parseAssignmentUpdateInput(input: unknown): AssignmentUpdateParseResult {
  if (!isRecord(input)) return { ok: false, error: "The assignment request is malformed." };

  const assignmentId = stringField(input.assignmentId);
  const lessonId = stringField(input.lessonId);
  if (!assignmentId || !UUID_PATTERN.test(assignmentId) || !lessonId || !UUID_PATTERN.test(lessonId)) {
    return { ok: false, error: "The assignment or lesson identifier is invalid." };
  }

  const title = stringField(input.title)?.trim() ?? "";
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > MAX_ASSIGNMENT_TITLE_LENGTH) {
    return { ok: false, error: `Title must be ${MAX_ASSIGNMENT_TITLE_LENGTH} characters or less.` };
  }

  const instructions = stringField(input.instructions)?.trim() ?? "";
  if (!instructions) return { ok: false, error: "Instructions are required." };
  if (instructions.length > MAX_ASSIGNMENT_INSTRUCTIONS_LENGTH) {
    return {
      ok: false,
      error: `Instructions must be ${MAX_ASSIGNMENT_INSTRUCTIONS_LENGTH.toLocaleString()} characters or less.`,
    };
  }

  if (typeof input.submission_type !== "string" || !SUBMISSION_TYPES.has(input.submission_type)) {
    return { ok: false, error: "Choose a valid assignment submission type." };
  }
  if (typeof input.requires_review !== "boolean") {
    return { ok: false, error: "The assignment review setting is invalid." };
  }

  const rubric = parseAssignmentRubric(input.rubric);
  if (!rubric.ok) return rubric;
  if (input.requires_review && rubric.items.length === 0) {
    return { ok: false, error: "Add at least one rubric criterion for reviewers." };
  }

  return {
    ok: true,
    value: {
      assignmentId,
      lessonId,
      title,
      instructions,
      submission_type: input.submission_type as AssignmentUpdateInput["submission_type"],
      requires_review: input.requires_review,
      rubric: rubric.items,
    },
  };
}

export function isAssignmentSubmissionType(value: unknown): value is AssignmentUpdateInput["submission_type"] {
  return typeof value === "string" && SUBMISSION_TYPES.has(value);
}

function stringField(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
