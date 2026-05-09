import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildTaggedEmailAddress,
  emailCaptureConfigFromEnv,
  extractFirstLink,
} from "../../e2e-prod/email-capture";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildTaggedEmailAddress", () => {
  it("builds plus-addressed aliases for disposable production email tests", () => {
    expect(buildTaggedEmailAddress("qa@bmhgroupkc.com", "PRD Ready_123")).toBe(
      "qa+prd-ready-123@bmhgroupkc.com",
    );
  });
});

describe("emailCaptureConfigFromEnv", () => {
  it("uses defaults when optional numeric env vars are blank", () => {
    vi.stubEnv("PROD_READINESS_EMAIL_INBOX", "info@bmhgroupkc.com");
    vi.stubEnv("PROD_READINESS_EMAIL_IMAP_PASS", "app-password");
    vi.stubEnv("PROD_READINESS_EMAIL_IMAP_PORT", "");
    vi.stubEnv("PROD_READINESS_EMAIL_POLL_MS", "");
    vi.stubEnv("PROD_READINESS_EMAIL_TIMEOUT_MS", "");

    expect(emailCaptureConfigFromEnv()).toMatchObject({
      inbox: "info@bmhgroupkc.com",
      host: "imap.gmail.com",
      port: 993,
      pollMs: 5000,
      timeoutMs: 90000,
    });
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

  it("trims closing brackets around plaintext email links", () => {
    const text =
      "[https://dhvfsyteqsxagokoerrx.supabase.co/auth/v1/verify?token=abc&type=recovery]";

    expect(extractFirstLink(text, /\/auth\/v1\/verify\?/)).toBe(
      "https://dhvfsyteqsxagokoerrx.supabase.co/auth/v1/verify?token=abc&type=recovery",
    );
  });
});
