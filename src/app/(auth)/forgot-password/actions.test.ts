import { describe, expect, it } from "vitest";

import { sendPasswordReset } from "./actions";

describe("legacy Institute password recovery", () => {
  it("cannot send an Institute recovery email", async () => {
    await expect(sendPasswordReset(null, new FormData())).resolves.toEqual({
      ok: false,
      error:
        "Institute password recovery is disabled. Recover your Hugo account instead.",
    });
  });
});
