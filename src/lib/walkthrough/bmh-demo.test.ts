import { describe, expect, it } from "vitest";

import {
  BMH_DEMO_WALKTHROUGH_ID,
  bmhDemoWalkthroughSteps,
  getBmhDemoWalkthroughUrl,
} from "./bmh-demo";

describe("BMH demo walkthrough", () => {
  it("defines the current BMH Institute walkthrough step count", () => {
    expect(bmhDemoWalkthroughSteps).toHaveLength(6);
    expect(bmhDemoWalkthroughSteps.map((step) => step.step)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("builds stable step URLs from walkthrough id and step number", () => {
    expect(getBmhDemoWalkthroughUrl(2)).toBe(
      `/courses/3803c874-b9da-44c7-9e2b-88bc5a870ef2?walkthrough=${BMH_DEMO_WALKTHROUGH_ID}&step=2`,
    );
    expect(getBmhDemoWalkthroughUrl(99)).toBeNull();
  });
});
