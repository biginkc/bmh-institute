import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isAdminEmail } from "./allowlist";

describe("isAdminEmail", () => {
  const originalAdmins = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  afterEach(() => {
    if (originalAdmins === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = originalAdmins;
    }
  });

  it("returns false for null or empty email", () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });

  it("defaults to jarrad@bmhgroupkc.com when ADMIN_EMAILS is unset", () => {
    expect(isAdminEmail("jarrad@bmhgroupkc.com")).toBe(true);
    expect(isAdminEmail("someone-else@bmhgroupkc.com")).toBe(false);
  });

  it("matches emails case-insensitively", () => {
    process.env.ADMIN_EMAILS = "Jarrad@BmhGroupKc.com";
    expect(isAdminEmail("jarrad@bmhgroupkc.com")).toBe(true);
    expect(isAdminEmail("JARRAD@BMHGROUPKC.COM")).toBe(true);
  });

  it("parses a comma-separated list and trims whitespace", () => {
    process.env.ADMIN_EMAILS = "a@x.com, b@x.com ,c@x.com";
    expect(isAdminEmail("a@x.com")).toBe(true);
    expect(isAdminEmail("b@x.com")).toBe(true);
    expect(isAdminEmail("c@x.com")).toBe(true);
    expect(isAdminEmail("d@x.com")).toBe(false);
  });

  it("ignores empty entries in the list", () => {
    process.env.ADMIN_EMAILS = ",,a@x.com,,";
    expect(isAdminEmail("a@x.com")).toBe(true);
  });
});
