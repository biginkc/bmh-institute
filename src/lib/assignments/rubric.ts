export type AssignmentRubricItem = {
  criterion: string;
  description: string;
};

export const MAX_RUBRIC_ITEMS = 20;
export const MAX_RUBRIC_CRITERION_LENGTH = 120;
export const MAX_RUBRIC_DESCRIPTION_LENGTH = 1_000;

export type AssignmentRubricParseResult =
  | { ok: true; items: AssignmentRubricItem[] }
  | { ok: false; error: string };

export function parseAssignmentRubric(value: unknown): AssignmentRubricParseResult {
  if (!Array.isArray(value)) {
    return { ok: false, error: "The assignment rubric is not an array." };
  }
  if (value.length > MAX_RUBRIC_ITEMS) {
    return { ok: false, error: `A rubric can contain up to ${MAX_RUBRIC_ITEMS} criteria.` };
  }

  const items: AssignmentRubricItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "The assignment rubric contains a malformed criterion." };
    }
    const criterion = "criterion" in item ? item.criterion : undefined;
    const description = "description" in item ? item.description : undefined;
    if (typeof criterion !== "string" || typeof description !== "string") {
      return { ok: false, error: "The assignment rubric contains a malformed criterion." };
    }
    const normalized = { criterion: criterion.trim(), description: description.trim() };
    if (!normalized.criterion || !normalized.description) {
      return { ok: false, error: "Every rubric criterion needs a name and review guidance." };
    }
    if (
      normalized.criterion.length > MAX_RUBRIC_CRITERION_LENGTH ||
      normalized.description.length > MAX_RUBRIC_DESCRIPTION_LENGTH
    ) {
      return {
        ok: false,
        error: `Rubric names must be ${MAX_RUBRIC_CRITERION_LENGTH} characters or less and guidance ${MAX_RUBRIC_DESCRIPTION_LENGTH.toLocaleString()} or less.`,
      };
    }
    items.push(normalized);
  }
  return { ok: true, items };
}
