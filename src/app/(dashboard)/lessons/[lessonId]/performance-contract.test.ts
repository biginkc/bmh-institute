import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/app/(dashboard)/lessons/[lessonId]/page.tsx"),
  "utf8",
);
const preparationSource = readFileSync(
  join(process.cwd(), "src/lib/content-blocks/prepare-learner-part.ts"),
  "utf8",
);

describe("lesson page performance contract", () => {
  it("uses the lesson-specific projection", () => {
    expect(source).toContain("loadLearnerLessonOutline");
    expect(source).not.toContain("loadLearnerCourseOutline");
  });

  it("selects the requested part before signing media or minting role-play embeds", () => {
    const select = preparationSource.indexOf("selectLearnerPart(parts, requestedPart)");
    const sign = preparationSource.indexOf("signBlocks(selected.blocks)");
    const embed = preparationSource.indexOf("attachEmbeds(signedBlocks)");
    expect(select).toBeGreaterThan(-1);
    expect(sign).toBeGreaterThan(select);
    expect(embed).toBeGreaterThan(sign);
  });

  it("does not perform a second identity lookup for role-play blocks", () => {
    const helper = source.slice(source.indexOf("async function attachRolePlayEmbeds"));
    expect(helper).not.toContain("auth.getUser()");
    expect(helper).not.toContain('.from("profiles")');
  });
});
