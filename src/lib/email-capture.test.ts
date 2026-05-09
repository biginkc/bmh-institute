import { describe, expect, it } from "vitest";

import {
  buildTaggedEmailAddress,
  extractFirstLink,
} from "../../e2e-prod/email-capture";

describe("buildTaggedEmailAddress", () => {
  it("builds plus-addressed aliases for disposable production email tests", () => {
    expect(buildTaggedEmailAddress("qa@bmhgroupkc.com", "PRD Ready_123")).toBe(
      "qa+prd-ready-123@bmhgroupkc.com",
    );
  });
});

describe("extractFirstLink", () => {
  it("extracts decoded Supabase action links from email HTML", () => {
    const html =
      '<a href="https://dhvfsyteqsxagokoerrx.supabase.co/auth/v1/verify?token=abc&amp;type=invite&amp;redirect_to=https%3A%2F%2Finstitute.bmhgroupkc.com%2Fauth%2Fcallback">Accept</a>';

    expect(extractFirstLink(html, /\/auth\/v1\/verify\?/)).toContain(
      "type=invite",
    );
  });
});
