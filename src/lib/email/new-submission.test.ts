import { describe, expect, it } from "vitest";

import { renderNewSubmissionEmail } from "./new-submission";

const BASE = {
  learnerName: "Gretchen",
  learnerEmail: "gretchen@example.com",
  assignmentTitle: "Phone objections homework",
  lessonTitle: "Handling the 'not interested' objection",
  submissionKind: "text" as const,
  submissionPreview: "My approach is to acknowledge then reframe...",
  submissionsUrl: "https://bmh-institute.vercel.app/admin/submissions",
};

describe("renderNewSubmissionEmail", () => {
  it("puts learner name + assignment in the subject", () => {
    const { subject } = renderNewSubmissionEmail(BASE);
    expect(subject).toContain("Gretchen");
    expect(subject).toMatch(/Phone objections homework/);
  });

  it("includes preview for text submissions", () => {
    const { html } = renderNewSubmissionEmail(BASE);
    expect(html).toContain("My approach");
    expect(html).toContain(BASE.submissionsUrl);
  });

  it("describes URL submissions with the link rendered", () => {
    const { html } = renderNewSubmissionEmail({
      ...BASE,
      submissionKind: "url",
      submissionPreview: "https://example.com/artifact",
    });
    expect(html).toContain("https://example.com/artifact");
  });

  it("describes file submissions without leaking the signed URL", () => {
    const { html } = renderNewSubmissionEmail({
      ...BASE,
      submissionKind: "file",
      submissionPreview: "resume.pdf (2.4 MB)",
    });
    expect(html).toContain("resume.pdf");
    expect(html).toMatch(/File attached/i);
  });

  it("escapes HTML-unsafe values in names + previews", () => {
    const { html } = renderNewSubmissionEmail({
      ...BASE,
      learnerName: "<script>x</script>",
      submissionPreview: "<img onerror=pwn>",
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain("<img onerror=pwn>");
    expect(html).toContain("&lt;script&gt;");
  });
});
