import { describe, expect, it } from "vitest";

import { setPassword } from "./actions";

describe("legacy Institute password setup", () => {
  it("cannot set an Institute password", async () => {
    await expect(setPassword(null, new FormData())).resolves.toEqual({
      ok: false,
      error:
        "Institute passwords are disabled. Change your Hugo password instead.",
    });
  });
});
