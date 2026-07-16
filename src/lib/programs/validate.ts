export type ProgramInput = {
  title: string;
  description: string | null;
  course_order_mode: "sequential" | "free";
  is_published: boolean;
  thumbnail_path: string | null;
};

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

const MAX_TITLE_LEN = 200;
const MAX_DESCRIPTION_LEN = 5000;

export function parseProgramInput(
  formData: FormData,
): ParseResult<ProgramInput> {
  const errors: Record<string, string> = {};

  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    errors.title = "Title is required.";
  } else if (title.length > MAX_TITLE_LEN) {
    errors.title = `Title must be at most ${MAX_TITLE_LEN} characters.`;
  }

  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const description = descriptionRaw === "" ? null : descriptionRaw;
  if (description && description.length > MAX_DESCRIPTION_LEN) {
    errors.description = `Description must be at most ${MAX_DESCRIPTION_LEN} characters.`;
  }

  const orderMode = String(formData.get("course_order_mode") ?? "free");
  if (orderMode !== "sequential" && orderMode !== "free") {
    errors.course_order_mode = "Choose sequential or free.";
  }

  const is_published = formData.get("is_published") === "on";
  const thumbnailRaw = String(formData.get("thumbnail_path") ?? "").trim();
  const thumbnail_path = thumbnailRaw || null;
  if (thumbnail_path && !isStoragePath(thumbnail_path)) {
    errors.thumbnail_path = "Use a relative path in private content storage.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      title,
      description,
      course_order_mode: orderMode as "sequential" | "free",
      is_published,
      thumbnail_path,
    },
  };
}

function isStoragePath(value: string): boolean {
  return !value.startsWith("/") && !value.includes("..") && !value.includes("://");
}
