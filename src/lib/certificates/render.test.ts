import { describe, expect, it } from "vitest";

import {
  normalizeLearnerCertificateTemplate,
  renderCertificateHtml,
} from "./render";

const FIELDS = {
  full_name: "Jarrad Henry",
  title: "Phone Basics",
  completion_date: "April 23, 2026",
  certificate_number: "BMH-C-2026-0001",
};

describe("renderCertificateHtml", () => {
  it("substitutes known merge fields", () => {
    const html = renderCertificateHtml(
      "<p>{{full_name}} finished {{title}} on {{completion_date}}</p>",
      FIELDS,
    );
    expect(html).toBe(
      "<p>Jarrad Henry finished Phone Basics on April 23, 2026</p>",
    );
  });

  it("leaves unknown merge fields empty", () => {
    const html = renderCertificateHtml(
      "<p>{{full_name}} {{unknown_field}}</p>",
      FIELDS,
    );
    expect(html).toBe("<p>Jarrad Henry </p>");
  });

  it("escapes HTML-unsafe characters in substituted values", () => {
    const html = renderCertificateHtml("<p>{{full_name}}</p>", {
      ...FIELDS,
      full_name: "<script>alert('xss')</script>",
    });
    expect(html).toBe(
      "<p>&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;</p>",
    );
  });

  it("sanitizes stored template HTML before rendering it to a learner", () => {
    const html = renderCertificateHtml(
      '<script>alert("template xss")</script><p onclick="alert(1)">{{full_name}}</p><a href="javascript:alert(2)">Unsafe</a>',
      FIELDS,
    );

    expect(html).toBe('<p>Jarrad Henry</p><a rel="noopener noreferrer" target="_self">Unsafe</a>');
  });

  it("returns the template unchanged when no merge fields are present", () => {
    const html = renderCertificateHtml(
      "<p>Certificate of achievement</p>",
      FIELDS,
    );
    expect(html).toBe("<p>Certificate of achievement</p>");
  });

  it("normalizes legacy learner-facing program wording at render time", () => {
    expect(
      normalizeLearnerCertificateTemplate(
        "<h1>Program Completion Certificate</h1><p>{{full_name}} has completed the program: {{title}}.</p>",
        "program",
      ),
    ).toBe(
      "<h1>Course Completion Certificate</h1><p>{{full_name}} has completed the course: {{title}}.</p>",
    );
  });

  it("does not alter course templates or learner field values containing Program", () => {
    const template = "<h1>Program Leadership</h1><p>{{title}}</p>";
    expect(normalizeLearnerCertificateTemplate(template, "course")).toBe(template);
    expect(
      renderCertificateHtml(
        normalizeLearnerCertificateTemplate(
          "<p>completed the {{title}} program</p>",
          "program",
        ),
        { ...FIELDS, title: "Program Leadership" },
      ),
    ).toBe("<p>completed the Program Leadership course</p>");
  });
});
