import { describe, expect, it } from "vitest";

import { getRolePlayBaseUrl, ROLE_PLAY_PRODUCTION_ORIGIN } from "./base-url";

describe("getRolePlayBaseUrl", () => {
  it("accepts only the frozen Closer Lab production origin in production", () => {
    expect(getRolePlayBaseUrl({
      NODE_ENV: "production",
      NEXT_PUBLIC_ROLE_PLAY_BASE_URL: ROLE_PLAY_PRODUCTION_ORIGIN,
    })).toBe(ROLE_PLAY_PRODUCTION_ORIGIN);
    expect(getRolePlayBaseUrl({
      NODE_ENV: "production",
      NEXT_PUBLIC_ROLE_PLAY_BASE_URL: "https://evil.example",
    })).toBeNull();
  });

  it("rejects paths, query strings, credentials, and plaintext production targets", () => {
    for (const value of [
      "https://lab.bmhgroupkc.com/other",
      "https://lab.bmhgroupkc.com/?token=secret",
      "https://user:pass@lab.bmhgroupkc.com",
      "http://lab.bmhgroupkc.com",
    ]) {
      expect(getRolePlayBaseUrl({ NODE_ENV: "production", NEXT_PUBLIC_ROLE_PLAY_BASE_URL: value })).toBeNull();
    }
  });

  it("permits the exact loopback target for local development", () => {
    expect(getRolePlayBaseUrl({ NODE_ENV: "development", NEXT_PUBLIC_ROLE_PLAY_BASE_URL: "http://localhost:3200" })).toBe("http://localhost:3200");
    expect(getRolePlayBaseUrl({ NODE_ENV: "development", NEXT_PUBLIC_ROLE_PLAY_BASE_URL: "http://localhost:3200/embed" })).toBeNull();
  });
});
