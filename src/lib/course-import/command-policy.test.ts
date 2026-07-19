import { describe, expect, it } from "vitest";

import {
  enforcePublicationBlockersForGate,
  manifestGateForCommand,
} from "./command-policy";

describe("course import command policy", () => {
  it("keeps canary apply, verify, and upload behind the isolated canary gate", () => {
    expect(manifestGateForCommand("apply", true)).toBe("canary");
    expect(manifestGateForCommand("verify", true)).toBe("canary");
    expect(manifestGateForCommand("upload", true)).toBe("canary");
  });

  it("allows canary rollback and storage inspection to survive approval drift", () => {
    expect(manifestGateForCommand("rollback", true)).toBe("draft");
    expect(manifestGateForCommand("inspect-rollback-storage", true)).toBe("draft");
  });

  it("enforces every non-quiz publication blocker during canary verification", () => {
    expect(enforcePublicationBlockersForGate("canary")).toBe(true);
    expect(enforcePublicationBlockersForGate("release")).toBe(true);
    expect(enforcePublicationBlockersForGate("draft")).toBe(false);
  });

  it("allows an explicitly requested unpublished review import without weakening release", () => {
    expect(manifestGateForCommand("apply", false, true)).toBe("draft");
    expect(manifestGateForCommand("verify", false, true)).toBe("draft");
    expect(manifestGateForCommand("apply", false, false)).toBe("release");
  });

  it("rejects combining review and canary scopes", () => {
    expect(() => manifestGateForCommand("apply", true, true)).toThrow(
      /review and canary/i,
    );
  });
});
