import { describe, expect, it } from "vitest";

import { renderCertificateHtml } from "./render";

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

  it("returns the template unchanged when no merge fields are present", () => {
    const html = renderCertificateHtml(
      "<p>Certificate of achievement</p>",
      FIELDS,
    );
    expect(html).toBe("<p>Certificate of achievement</p>");
  });
});
