import { describe, expect, it } from "vitest";

import { parseAssignmentRubric } from "./rubric";

describe("parseAssignmentRubric", () => {
  it("normalizes complete rubric criteria from database JSON", () => {
    expect(
      parseAssignmentRubric([
        { criterion: "  Systems readiness ", description: " Confirm every login.  " },
        { criterion: "Service mindset", description: "Uses respectful seller language." },
      ]),
    ).toEqual([
      { criterion: "Systems readiness", description: "Confirm every login." },
      { criterion: "Service mindset", description: "Uses respectful seller language." },
    ]);
  });

  it("fails closed for malformed database JSON", () => {
    expect(
      parseAssignmentRubric([
        null,
        "criterion",
        { criterion: "Missing description" },
        { criterion: "", description: "Blank criterion" },
      ]),
    ).toEqual([]);
  });
});
