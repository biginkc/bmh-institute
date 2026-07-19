import { describe, expect, it } from "vitest";

import { isConfiguredRolePlayScenarioId } from "./scenario-id";

describe("isConfiguredRolePlayScenarioId", () => {
  it("rejects empty and review-placeholder scenario identifiers", () => {
    expect(isConfiguredRolePlayScenarioId("")).toBe(false);
    expect(isConfiguredRolePlayScenarioId(" pending:guarded-inbound ")).toBe(
      false,
    );
  });

  it("accepts a production scenario identifier", () => {
    expect(isConfiguredRolePlayScenarioId("scenario_123")).toBe(true);
  });
});
