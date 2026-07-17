import { describe, expect, it } from "vitest";

import { manifestGateForCommand } from "./command-policy";

describe("course import command policy", () => {
  it("keeps canary apply, verify, and upload behind the release gate", () => {
    expect(manifestGateForCommand("apply", true)).toBe("release");
    expect(manifestGateForCommand("verify", true)).toBe("release");
    expect(manifestGateForCommand("upload", true)).toBe("release");
  });

  it("allows canary rollback and storage inspection to survive approval drift", () => {
    expect(manifestGateForCommand("rollback", true)).toBe("draft");
    expect(manifestGateForCommand("inspect-rollback-storage", true)).toBe("draft");
  });
});
