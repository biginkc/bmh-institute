import { describe, expect, it } from "vitest";

import {
  getWalkthroughContentTypeCounts,
  WALKTHROUGH_CLOSER_LAB_SCENARIO_ID,
  WALKTHROUGH_COURSE,
  WALKTHROUGH_PROGRAM,
  walkthroughModules,
} from "./curriculum";

describe("walkthrough curriculum", () => {
  it("defines a durable walkthrough program with four modules", () => {
    expect(WALKTHROUGH_PROGRAM).toBe("BMH Institute Walkthrough Onboarding");
    expect(WALKTHROUGH_COURSE).toBe("Walkthrough Demo: BMH Training Flow");
    expect(walkthroughModules).toHaveLength(4);
    expect(walkthroughModules.every((module) => module.lessons.length >= 2)).toBe(
      true,
    );
  });

  it("includes several learning content types for onboarding walkthroughs", () => {
    const counts = getWalkthroughContentTypeCounts();

    expect(counts.content).toBeGreaterThanOrEqual(6);
    expect(counts.text).toBeGreaterThanOrEqual(6);
    expect(counts.callout).toBeGreaterThanOrEqual(4);
    expect(counts.external_link).toBeGreaterThanOrEqual(2);
    expect(counts.embed).toBeGreaterThanOrEqual(1);
    expect(counts.role_play).toBe(1);
    expect(counts.quiz).toBe(1);
    expect(counts.assignment).toBe(1);
  });

  it("uses the production Closer Lab walkthrough scenario", () => {
    const rolePlayBlocks = walkthroughModules.flatMap((module) =>
      module.lessons.flatMap((lesson) =>
        lesson.type === "content"
          ? lesson.blocks.filter((block) => block.type === "role_play")
          : [],
      ),
    );

    expect(rolePlayBlocks).toEqual([
      expect.objectContaining({
        scenario_id: WALKTHROUGH_CLOSER_LAB_SCENARIO_ID,
        title: "Closer Lab Demo: Skeptical Seller",
      }),
    ]);
  });
});
