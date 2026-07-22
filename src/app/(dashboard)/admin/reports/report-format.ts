type Profile = {
  id: string;
  email: string;
  full_name: string;
  system_role: "owner" | "admin" | "learner";
};

type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type Entity = { id: string; title: string };

type CourseCert = { user_id: string; course_id: string; issued_at: string };

type Completion = {
  user_id: string;
  lesson_id: string;
  completed_at: string | null;
};

export type ActivityMaps = {
  profilesById: Map<string, Profile>;
  coursesById: Map<string, string>;
  programsById: Map<string, string>;
  lessonTitlesById: Map<string, string>;
  courseTitlesByLessonId: Map<string, string>;
};

export type FormattedActivityRow = {
  actor: string;
  label: string;
  detail: string;
  badge: string;
  createdAt: string;
};

export function splitActivityRows<T extends FormattedActivityRow>(rows: T[]) {
  const learnerRows: T[] = [];
  const systemRows: T[] = [];

  for (const row of rows) {
    if (row.actor === "System activity" || row.badge === "System") {
      systemRows.push(row);
    } else {
      learnerRows.push(row);
    }
  }

  return { learnerRows, systemRows };
}

export function summarizeByCourse({
  courses,
  courseCerts,
  completions,
  courseIdByLessonId,
}: {
  courses: Entity[];
  courseCerts: CourseCert[];
  completions: Completion[];
  courseIdByLessonId: Map<string, string>;
}) {
  const certCountByCourse = groupCount(courseCerts, (c) => c.course_id);
  const learnersByCourse = new Map<string, Set<string>>();
  for (const completion of completions) {
    const courseId = courseIdByLessonId.get(completion.lesson_id);
    if (!courseId) continue;
    const learnerIds = learnersByCourse.get(courseId) ?? new Set<string>();
    learnerIds.add(completion.user_id);
    learnersByCourse.set(courseId, learnerIds);
  }
  return courses.map((course) => ({
    id: course.id,
    title: course.title,
    activeLearners: learnersByCourse.get(course.id)?.size ?? 0,
    completedCount: certCountByCourse.get(course.id) ?? 0,
  }));
}

export function formatActivityRow(
  row: AuditRow,
  maps: ActivityMaps,
): FormattedActivityRow {
  const profile = row.user_id ? maps.profilesById.get(row.user_id) : undefined;
  const actor = row.user_id
    ? profile?.full_name || profile?.email || "Unknown learner"
    : "System activity";
  const lessonDetail = formatLessonDetail(row.entity_id, maps);

  switch (row.action) {
    case "lesson_completed":
      return {
        actor,
        label: "Completed lesson",
        detail: lessonDetail,
        badge: "Learning",
        createdAt: row.created_at,
      };
    case "quiz_passed": {
      const score = row.metadata?.score;
      return {
        actor,
        label: "Passed quiz",
        detail:
          typeof score === "number"
            ? `${lessonDetail} with ${score}%`
            : lessonDetail,
        badge: "Learning",
        createdAt: row.created_at,
      };
    }
    case "assignment_approved":
      return {
        actor,
        label: "Assignment approved",
        detail: lessonDetail,
        badge: "Assignment",
        createdAt: row.created_at,
      };
    case "course_certificate_issued": {
      const title = row.entity_id
        ? maps.coursesById.get(row.entity_id)
        : undefined;
      return {
        actor,
        label: "Issued course certificate",
        detail: appendDetail(title ?? "Course", certificateNumber(row)),
        badge: "Certificate",
        createdAt: row.created_at,
      };
    }
    case "program_certificate_issued": {
      const title = row.entity_id
        ? maps.programsById.get(row.entity_id)
        : undefined;
      return {
        actor,
        label: "Issued program certificate",
        detail: appendDetail(title ?? "Program", certificateNumber(row)),
        badge: "Certificate",
        createdAt: row.created_at,
      };
    }
    default:
      return {
        actor,
        label: titleize(row.action),
        detail: row.entity_type,
        badge: row.user_id ? "Activity" : "System",
        createdAt: row.created_at,
      };
  }
}

function formatLessonDetail(
  lessonId: string | null,
  maps: ActivityMaps,
): string {
  if (!lessonId) return "Lesson";
  const lessonTitle = maps.lessonTitlesById.get(lessonId) ?? "Lesson";
  const courseTitle = maps.courseTitlesByLessonId.get(lessonId);
  return courseTitle ? `${lessonTitle} in ${courseTitle}` : lessonTitle;
}

function certificateNumber(row: AuditRow): string {
  const number = row.metadata?.certificate_number;
  return typeof number === "string" ? number : "";
}

function appendDetail(primary: string, secondary: string): string {
  return secondary ? `${primary}, ${secondary}` : primary;
}

function titleize(value: string): string {
  const clean = value.replace(/_/g, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function groupCount<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}
