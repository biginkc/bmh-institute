import { describe, expect, it } from "vitest";

import { signIn } from "./actions";

describe("legacy Institute password sign-in", () => {
  it("cannot establish a session", async () => {
    await expect(signIn(null, new FormData())).resolves.toEqual({
      ok: false,
      error: "Institute passwords are disabled. Continue with Hugo.",
    });
  });
});
