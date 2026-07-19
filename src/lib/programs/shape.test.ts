import { describe, expect, it } from "vitest";

import { shapeProgramsResponse } from "./shape";

describe("shapeProgramsResponse", () => {
  it("returns an empty array when Supabase returns null", () => {
    expect(shapeProgramsResponse(null)).toEqual([]);
  });

  it("returns an empty array when given an empty list", () => {
    expect(shapeProgramsResponse([])).toEqual([]);
  });

  it("flattens program_courses -> courses and preserves the program's sort_order on courses", () => {
    const raw = [
      {
        id: "p1",
        title: "Appointment Setter Onboarding",
        description: null,
        thumbnail_path: "programs/appointment-setter.webp",
        course_order_mode: "sequential" as const,
        is_published: true,
        sort_order: 0,
        program_courses: [
          {
            sort_order: 1,
            courses: {
              id: "c2",
              title: "Handling Objections",
              description: null,
              thumbnail_path: "courses/objections.webp",
              is_published: true,
            },
          },
          {
            sort_order: 0,
            courses: {
              id: "c1",
              title: "Phone Basics",
              description: null,
              thumbnail_path: "courses/phone-basics.webp",
              is_published: true,
            },
          },
        ],
      },
    ];

    const shaped = shapeProgramsResponse(raw);

    expect(shaped).toHaveLength(1);
    expect(shaped[0].id).toBe("p1");
    expect(shaped[0].thumbnail_path).toBe("programs/appointment-setter.webp");
    expect(shaped[0].courses[0].thumbnail_path).toBe("courses/phone-basics.webp");
    // Courses must be ordered by program_courses.sort_order, not their own.
    expect(shaped[0].courses.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("skips program_courses rows whose course join is null (published=false filter side-effect)", () => {
    const raw = [
      {
        id: "p1",
        title: "P1",
        description: null,
        thumbnail_path: null,
        course_order_mode: "free" as const,
        is_published: true,
        sort_order: 0,
        program_courses: [
          { sort_order: 0, courses: null },
          {
            sort_order: 1,
            courses: {
              id: "c2",
              title: "C2",
              description: null,
              thumbnail_path: null,
              is_published: true,
            },
          },
        ],
      },
    ];

    const shaped = shapeProgramsResponse(raw);

    expect(shaped[0].courses.map((c) => c.id)).toEqual(["c2"]);
  });

  it("sorts multiple programs by program.sort_order", () => {
    const raw = [
      {
        id: "p2",
        title: "Second",
        description: null,
        thumbnail_path: null,
        course_order_mode: "free" as const,
        is_published: true,
        sort_order: 1,
        program_courses: [],
      },
      {
        id: "p1",
        title: "First",
        description: null,
        thumbnail_path: null,
        course_order_mode: "free" as const,
        is_published: true,
        sort_order: 0,
        program_courses: [],
      },
    ];

    const shaped = shapeProgramsResponse(raw);

    expect(shaped.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});
