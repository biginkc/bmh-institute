import { test } from "@playwright/test";

test.describe("manual Hugo production acceptance", () => {
  test.skip(
    true,
    "Manual Chrome gate: prove both active Hugo users preserve their existing Institute UID, role, profile, and learning records; an unprovisioned Hugo user creates no account or content; suspended access is denied without a loop; the former app password is rejected; and recovery sends no Institute email.",
  );

  test("requires the two-user and negative-access Chrome gate", async () => {
    // The acceptance is intentionally manual. It needs real Hugo identities and
    // must not be replaced with an Institute password or forged app session.
  });
});
