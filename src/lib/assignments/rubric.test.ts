import { describe, expect, it } from "vitest";

import { parseAssignmentRubric } from "./rubric";

describe("parseAssignmentRubric", () => {
  it("normalizes complete rubric criteria from database JSON", () => {
    expect(
      parseAssignmentRubric([
        { criterion: "  Systems readiness ", description: " Confirm every login.  " },
        { criterion: "Service mindset", description: "Uses respectful seller language." },
      ]),
    ).toEqual({
      ok: true,
      items: [
        { criterion: "Systems readiness", description: "Confirm every login." },
        { criterion: "Service mindset", description: "Uses respectful seller language." },
      ],
    });
  });

  it("fails the whole rubric instead of silently dropping corrupt criteria", () => {
    expect(parseAssignmentRubric([{ criterion: "Valid", description: "Keep me" }, null])).toEqual({
      ok: false,
      error: "The assignment rubric contains a malformed criterion.",
    });
  });
});
