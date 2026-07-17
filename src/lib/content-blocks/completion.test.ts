import { describe, expect, it } from "vitest";

import {
  defaultRequiredForBlock,
  normalizeRequiredForBlock,
} from "./completion";

describe("content block completion eligibility", () => {
  it("defaults newly created and still-unconfigured blocks to optional", () => {
    expect(defaultRequiredForBlock()).toBe(false);
  });

  it("forces external videos and non-trackable blocks to non-required", () => {
    expect(
      normalizeRequiredForBlock("video", { source: "youtube" }, true),
    ).toBe(false);
    expect(
      normalizeRequiredForBlock("text", { html: "<p>Read this</p>" }, true),
    ).toBe(false);
  });

  it("preserves the requested state for uploaded videos and role plays", () => {
    expect(
      normalizeRequiredForBlock(
        "video",
        { source: "upload", file_path: "course/video.mp4" },
        true,
      ),
    ).toBe(true);
    expect(
      normalizeRequiredForBlock(
        "video",
        { source: "upload", file_path: "course/video.mp4" },
        false,
      ),
    ).toBe(false);
    expect(
      normalizeRequiredForBlock(
        "role_play",
        { scenario_id: "scenario-1" },
        true,
      ),
    ).toBe(true);
  });

  it("keeps incomplete video and role-play configurations optional", () => {
    expect(
      normalizeRequiredForBlock("video", { source: "upload", file_path: "" }, true),
    ).toBe(false);
    expect(
      normalizeRequiredForBlock("role_play", { scenario_id: "" }, true),
    ).toBe(false);
  });
});
