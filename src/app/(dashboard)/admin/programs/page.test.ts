import { describe, expect, it } from "vitest";

import { addProgramCourseCounts } from "./page";

describe("addProgramCourseCounts", () => {
  it("adds course counts without changing program order", () => {
    const rows = addProgramCourseCounts(
      [
        { id: "program-a", title: "Program A" },
        { id: "program-b", title: "Program B" },
      ],
      [
        { program_id: "program-b" },
        { program_id: "program-a" },
        { program_id: "program-b" },
      ],
    );

    expect(rows).toEqual([
      { id: "program-a", title: "Program A", courseCount: 1 },
      { id: "program-b", title: "Program B", courseCount: 2 },
    ]);
  });
});
