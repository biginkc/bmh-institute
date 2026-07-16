export type AssignmentRubricItem = {
  criterion: string;
  description: string;
};

export function parseAssignmentRubric(value: unknown): AssignmentRubricItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const criterion = "criterion" in item ? item.criterion : undefined;
    const description = "description" in item ? item.description : undefined;
    if (typeof criterion !== "string" || typeof description !== "string") return [];
    const normalized = {
      criterion: criterion.trim(),
      description: description.trim(),
    };
    return normalized.criterion && normalized.description ? [normalized] : [];
  });
}
