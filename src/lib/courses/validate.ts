export type CourseInput = {
  title: string;
  description: string | null;
  is_published: boolean;
  thumbnail_path: string | null;
};

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

const MAX_TITLE_LEN = 200;
const MAX_DESCRIPTION_LEN = 5000;

export function parseCourseInput(formData: FormData): ParseResult<CourseInput> {
  const errors: Record<string, string> = {};

  const title = String(formData.get("title") ?? "").trim();
  if (!title) errors.title = "Title is required.";
  else if (title.length > MAX_TITLE_LEN)
    errors.title = `Title must be at most ${MAX_TITLE_LEN} characters.`;

  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const description = descriptionRaw === "" ? null : descriptionRaw;
  if (description && description.length > MAX_DESCRIPTION_LEN) {
    errors.description = `Description must be at most ${MAX_DESCRIPTION_LEN} characters.`;
  }

  const is_published = formData.get("is_published") === "on";
  const thumbnailRaw = String(formData.get("thumbnail_path") ?? "").trim();
  const thumbnail_path = thumbnailRaw || null;
  if (thumbnail_path && !isStoragePath(thumbnail_path)) {
    errors.thumbnail_path = "Use a relative path in private content storage.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { title, description, is_published, thumbnail_path } };
}

function isStoragePath(value: string): boolean {
  return !value.startsWith("/") && !value.includes("..") && !value.includes("://");
}
