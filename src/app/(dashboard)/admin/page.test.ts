import { describe, expect, it } from "vitest";

import { getNeedsAttentionItems } from "./page";

describe("getNeedsAttentionItems", () => {
  it("returns a calm empty state when nothing needs attention", () => {
    expect(
      getNeedsAttentionItems({
        pendingSubmissions: 0,
        pendingInvites: 0,
        expiredInvites: 0,
        draftPrograms: 0,
        draftCourses: 0,
      }),
    ).toEqual([]);
  });

  it("surfaces only actionable admin overview signals", () => {
    const items = getNeedsAttentionItems({
      pendingSubmissions: 2,
      pendingInvites: 1,
      expiredInvites: 3,
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
        label: "Expired invites",
        detail: "3 invites need cleanup or resending",
        href: "/admin/users",
        tone: "urgent",
      },
      {
        label: "Pending invites",
        detail: "1 invite is waiting for signup",
        href: "/admin/users",
        tone: "normal",
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
