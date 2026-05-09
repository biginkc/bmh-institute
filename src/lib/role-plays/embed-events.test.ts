import { describe, expect, it } from "vitest";

import {
  clampRolePlayHeight,
  getTrustedOrigin,
  isTrustedRolePlayMessage,
  parseRolePlayEvent,
} from "./embed-events";

describe("role-play embed event helpers", () => {
  it("accepts trusted completion events for the expected scenario", () => {
    const event = parseRolePlayEvent({
      type: "rp.complete",
      scenario_id: "scenario-1",
      attempt_id: "attempt-1",
      score: 87,
    });

    expect(
      isTrustedRolePlayMessage({
        eventOrigin: "http://localhost:3200",
        trustedOrigin: getTrustedOrigin("http://localhost:3200/embed/role-play/scenario-1"),
        expectedScenarioId: "scenario-1",
        event,
      }),
    ).toBe(true);
  });

  it("rejects messages from untrusted origins", () => {
    const event = parseRolePlayEvent({
      type: "rp.complete",
      scenario_id: "scenario-1",
      attempt_id: "attempt-1",
      score: 87,
    });

    expect(
      isTrustedRolePlayMessage({
        eventOrigin: "https://evil.example",
        trustedOrigin: "http://localhost:3200",
        expectedScenarioId: "scenario-1",
        event,
      }),
    ).toBe(false);
  });

  it("rejects malformed completion events", () => {
    expect(
      parseRolePlayEvent({
        type: "rp.complete",
        scenario_id: "scenario-1",
        score: 87,
      }),
    ).toBeNull();
  });

  it("clamps iframe height requests", () => {
    expect(clampRolePlayHeight(200)).toBe(360);
    expect(clampRolePlayHeight(940.4)).toBe(940);
    expect(clampRolePlayHeight(2000)).toBe(1400);
  });
});
