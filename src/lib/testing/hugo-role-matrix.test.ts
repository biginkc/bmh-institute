import { describe, expect, it } from "vitest";

import { HUGO_PROJECT_ROLE_MATRIX } from "../../../e2e/hugo-acceptance";

describe("Hugo browser acceptance role matrix", () => {
  it("matches the complete approved cross-app role contract exactly", () => {
    expect(HUGO_PROJECT_ROLE_MATRIX).toEqual([
      { project: "institute", roles: ["owner", "admin", "learner"], state: "seeded" },
      { project: "closer", roles: ["admin", "member"], state: "placeholder" },
      { project: "sandra", roles: ["owner", "member"], state: "placeholder" },
      { project: "jitter", roles: ["admin", "operator"], state: "placeholder" },
    ]);
  });
});
