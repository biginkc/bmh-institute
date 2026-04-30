import { describe, expect, it } from "vitest";

import { renderEnrollmentEmail } from "./enrollment";

describe("renderEnrollmentEmail", () => {
  const defaults = {
    inviteeEmail: "new-va@example.com",
    appUrl: "https://bmh-institute.vercel.app",
    programs: [
      { id: "p1", title: "Appointment Setter Onboarding" },
      { id: "p2", title: "Objection Handling" },
    ],
    standaloneCourses: [{ id: "c1", title: "Compliance Refresher" }],
  };

  it("produces a subject that mentions the program count", () => {
    const { subject } = renderEnrollmentEmail(defaults);
    expect(subject).toMatch(/you're enrolled/i);
  });

  it("lists every program and standalone course in the body", () => {
    const { html } = renderEnrollmentEmail(defaults);
    expect(html).toContain("Appointment Setter Onboarding");
    expect(html).toContain("Objection Handling");
    expect(html).toContain("Compliance Refresher");
    expect(html).toContain(defaults.appUrl);
  });

  it("escapes HTML-unsafe characters in titles", () => {
    const { html } = renderEnrollmentEmail({
      ...defaults,
      programs: [{ id: "p1", title: "<script>alert(1)</script>" }],
      standaloneCourses: [],
    });
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a graceful body when no programs or courses are assigned", () => {
    const { html } = renderEnrollmentEmail({
      ...defaults,
      programs: [],
      standaloneCourses: [],
    });
    expect(html).toMatch(/getting set up/i);
  });
});
