import { describe, expect, it } from "vitest";

import { getNeedsAttentionItems } from "./page";

describe("getNeedsAttentionItems", () => {
  it("returns a calm empty state when nothing needs attention", () => {
    expect(
      getNeedsAttentionItems({
        pendingSubmissions: 0,
        draftPrograms: 0,
        draftCourses: 0,
      }),
    ).toEqual([]);
  });

  it("surfaces only actionable admin overview signals", () => {
    const items = getNeedsAttentionItems({
      pendingSubmissions: 2,
      draftPrograms: 0,
      draftCourses: 4,
    });

    expect(items).toEqual([
      {
        label: "Pending submissions",
        detail: "2 submissions need review",
        href: "/admin/submissions",
        tone: "urgent",
      },
      {
        label: "Draft courses",
        detail: "4 courses are not visible to learners",
        href: "/admin/courses",
        tone: "normal",
      },
    ]);
  });
});
