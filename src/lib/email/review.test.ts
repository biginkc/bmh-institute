import { describe, expect, it } from "vitest";

import {
  renderApprovedEmail,
  renderRevisionEmail,
} from "./review";

const BASE = {
  recipientEmail: "va@example.com",
  recipientName: "Gretchen",
  assignmentTitle: "Phone objections homework",
  lessonTitle: "Handling the 'not interested' objection",
  lessonUrl: "https://bmh-institute.vercel.app/lessons/abc",
};

describe("renderApprovedEmail", () => {
  it("mentions the assignment and congratulates", () => {
    const { subject, html } = renderApprovedEmail(BASE);
    expect(subject).toMatch(/approved/i);
    expect(html).toContain("Phone objections homework");
    expect(html).toContain("Gretchen");
    expect(html).toContain(BASE.lessonUrl);
  });

  it("includes a reviewer note if supplied", () => {
    const { html } = renderApprovedEmail({
      ...BASE,
      note: "Great work — moved you to the next module.",
    });
    expect(html).toContain("Great work");
  });

  it("escapes HTML-unsafe values", () => {
    const { html } = renderApprovedEmail({
      ...BASE,
      recipientName: "<script>x</script>",
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderRevisionEmail", () => {
  it("asks for revision and includes the reviewer note verbatim", () => {
    const { subject, html } = renderRevisionEmail({
      ...BASE,
      note: "Please re-record with a louder mic.",
    });
    expect(subject).toMatch(/revision/i);
    expect(html).toContain("Please re-record with a louder mic.");
    expect(html).toContain(BASE.lessonUrl);
  });

  it("omits the note block when no note is supplied", () => {
    const { html } = renderRevisionEmail({
      ...BASE,
      note: "",
    });
    expect(html).toMatch(/needs revision/i);
    expect(html).not.toContain("What to fix");
  });
});
