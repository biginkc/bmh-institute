import { describe, expect, it } from "vitest";

import { formatActivityRow } from "./page";

describe("formatActivityRow", () => {
  const profilesById = new Map([
    [
      "user-1",
      {
        id: "user-1",
        email: "learner@example.com",
        full_name: "Maria Santos",
        system_role: "learner" as const,
      },
    ],
  ]);

  const baseMaps = {
    profilesById,
    coursesById: new Map([["course-1", "Intro to BMH"]]),
    programsById: new Map([["program-1", "VA Onboarding"]]),
    lessonTitlesById: new Map([["lesson-1", "Lead intake basics"]]),
    courseTitlesByLessonId: new Map([["lesson-1", "Intro to BMH"]]),
  };

  it("labels learner activity with actor, action, entity context, and time", () => {
    expect(
      formatActivityRow(
        {
          id: "audit-1",
          user_id: "user-1",
          action: "quiz_passed",
          entity_type: "lesson",
          entity_id: "lesson-1",
          metadata: { score: 92 },
          created_at: "2026-05-01T12:00:00.000Z",
        },
        baseMaps,
      ),
    ).toEqual({
      actor: "Maria Santos",
      label: "Passed quiz",
      detail: "Lead intake basics in Intro to BMH with 92%",
      badge: "Learning",
      createdAt: "2026-05-01T12:00:00.000Z",
    });
  });

  it("uses clearer system copy for rows without a user", () => {
    expect(
      formatActivityRow(
        {
          id: "audit-2",
          user_id: null,
          action: "course_certificate_issued",
          entity_type: "course",
          entity_id: "course-1",
          metadata: { certificate_number: "BMH-C-1001" },
          created_at: "2026-05-02T12:00:00.000Z",
        },
        baseMaps,
      ),
    ).toEqual({
      actor: "System activity",
      label: "Issued course certificate",
      detail: "Intro to BMH, BMH-C-1001",
      badge: "Certificate",
      createdAt: "2026-05-02T12:00:00.000Z",
    });
  });
});
