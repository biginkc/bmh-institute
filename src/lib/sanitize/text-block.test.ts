import { describe, expect, it } from "vitest";

import { sanitizeTextBlockHtml } from "./text-block";

describe("sanitizeTextBlockHtml", () => {
  it("strips script tags entirely", () => {
    const html = '<p>Safe text</p><script>alert("xss")</script>';

    expect(sanitizeTextBlockHtml(html)).toBe("<p>Safe text</p>");
  });

  it("rejects javascript and data hrefs", () => {
    const html =
      '<p><a href="javascript:alert(1)">Bad</a> <a href="data:text/html,hi">Data</a></p>';
    const result = sanitizeTextBlockHtml(html);

    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("data:");
    expect(result).toContain(">Bad</a>");
    expect(result).toContain(">Data</a>");
  });

  it("forces noopener noreferrer rel on anchors", () => {
    const html = '<a href="https://example.com" rel="friend">Read</a>';

    expect(sanitizeTextBlockHtml(html)).toBe(
      '<a href="https://example.com" rel="noopener noreferrer" target="_self">Read</a>',
    );
  });

  it("strips inline style attributes", () => {
    const html = '<p style="color:red">Styled</p>';

    expect(sanitizeTextBlockHtml(html)).toBe("<p>Styled</p>");
  });

  it("is idempotent", () => {
    const html =
      '<p style="color:red"><a href="https://example.com">Safe</a></p><script>alert(1)</script>';
    const once = sanitizeTextBlockHtml(html);

    expect(sanitizeTextBlockHtml(once)).toBe(once);
  });
});
