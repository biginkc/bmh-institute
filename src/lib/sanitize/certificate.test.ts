import { describe, expect, it } from "vitest";

import { sanitizeCertificateBodyHtml } from "./certificate";

const SEEDED_COURSE_TEMPLATE =
  '<div style="text-align:center;padding:48px;font-family:Georgia,serif"><h1 style="font-size:36px;margin-bottom:8px">Certificate of Completion</h1><p style="font-size:18px">This certifies that</p><h2 style="font-size:28px;margin:16px 0">{{full_name}}</h2><p style="font-size:18px">has completed the course</p><h3 style="font-size:22px;margin:16px 0">{{title}}</h3><p style="font-size:16px">on {{completion_date}}</p><p style="font-size:14px;margin-top:32px;color:#666">Certificate number: {{certificate_number}}</p><p style="font-size:14px;color:#666">Issued by BMH Group</p></div>';

describe("sanitizeCertificateBodyHtml", () => {
  it("preserves the seeded certificate template styles", () => {
    expect(sanitizeCertificateBodyHtml(SEEDED_COURSE_TEMPLATE)).toBe(
      SEEDED_COURSE_TEMPLATE,
    );
  });

  it("allows only approved inline styles", () => {
    const html =
      '<p style="font-size:18px;position:absolute;color:#666;text-align:center">Styled</p>';

    expect(sanitizeCertificateBodyHtml(html)).toBe(
      '<p style="font-size:18px;color:#666;text-align:center">Styled</p>',
    );
  });

  it("rejects non-https image sources", () => {
    const html =
      '<img src="http://example.com/badge.png" alt="Badge"><img src="https://example.com/badge.png" alt="Badge">';
    const result = sanitizeCertificateBodyHtml(html);

    expect(result).not.toContain("http://example.com");
    expect(result).toContain('src="https://example.com/badge.png"');
  });

  it("strips scripts", () => {
    const html = '<div>Safe</div><script>alert("xss")</script>';

    expect(sanitizeCertificateBodyHtml(html)).toBe("<div>Safe</div>");
  });

  it("is idempotent", () => {
    const html =
      '<div style="position:absolute;text-align:center"><img src="https://example.com/badge.png"><script>alert(1)</script></div>';
    const once = sanitizeCertificateBodyHtml(html);

    expect(sanitizeCertificateBodyHtml(once)).toBe(once);
  });
});
