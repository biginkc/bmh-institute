export type ProgramSummary = {
  id: string;
  title: string;
  description: string | null;
  thumbnail_path: string | null;
  thumbnailUrl?: string;
  course_order_mode: "sequential" | "free";
  is_published: boolean;
  sort_order: number;
};

export type CourseSummary = {
  id: string;
  title: string;
  description: string | null;
  thumbnail_path: string | null;
  thumbnailUrl?: string;
  is_published: boolean;
};

export type ProgramWithCourses = ProgramSummary & {
  courses: CourseSummary[];
};

// Supabase PostgREST returns nested FK joins as arrays by default. We tolerate
// both shapes here so generated Database types can upgrade the shape later
// without forcing every caller to care.
type RawProgramCourse = {
  sort_order: number;
  courses: CourseSummary | CourseSummary[] | null;
};

type RawProgram = Omit<ProgramSummary, "course_order_mode"> & {
  course_order_mode: string;
  program_courses: RawProgramCourse[] | null;
};

function firstCourse(raw: RawProgramCourse["courses"]): CourseSummary | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export function shapeProgramsResponse(
  raw: RawProgram[] | null | undefined,
): ProgramWithCourses[] {
  if (!raw || raw.length === 0) return [];

  return [...raw]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((program) => {
      const joinRows = program.program_courses ?? [];
      const courses = [...joinRows]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((row) => firstCourse(row.courses))
        .filter((course): course is CourseSummary => course !== null);

      return {
        id: program.id,
        title: program.title,
        description: program.description,
        thumbnail_path: program.thumbnail_path,
        course_order_mode: parseCourseOrderMode(program.course_order_mode),
        is_published: program.is_published,
        sort_order: program.sort_order,
        courses,
      };
    });
}

function parseCourseOrderMode(value: string): ProgramSummary["course_order_mode"] {
  return value === "sequential" ? "sequential" : "free";
}
