import { describe, expect, it } from "vitest";

import { requireE2eSeedPassword } from "./e2e-seed-password";

describe("requireE2eSeedPassword", () => {
  it("returns a sufficiently strong injected test secret", () => {
    const password = "A-unique-test-secret-123456";
    expect(requireE2eSeedPassword({ E2E_SEED_PASSWORD: password })).toBe(
      password,
    );
  });

  it.each([
    undefined,
    "",
    "short",
    "aaaaaaaaaaaaaaaaaaaaaaaa",
    "valid-looking-secret-1234\n",
  ])(
    "rejects a missing or weak durable credential without echoing it",
    (password) => {
      expect(() =>
        requireE2eSeedPassword({ E2E_SEED_PASSWORD: password }),
      ).toThrow(/E2E_SEED_PASSWORD/);
    },
  );
});
