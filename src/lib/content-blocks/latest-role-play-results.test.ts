import { describe, expect, it } from "vitest";

import {
  reduceLatestRolePlayResults,
  type RolePlayResultRow,
} from "./latest-role-play-results";

function row(overrides: Partial<RolePlayResultRow>): RolePlayResultRow {
  return {
    block_id: "block-1",
    score: 85,
    goals_met: { a: true, b: false },
    summary: { summary_url: "https://lab.bmhgroupkc.com/embed/review/token" },
    completed_at: "2026-07-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("reduceLatestRolePlayResults", () => {
  it("keeps the first row per block — the caller orders rows most-recent-first", () => {
    const rows = [
      row({ block_id: "block-1", score: 90, completed_at: "2026-07-30T12:00:00.000Z" }),
      row({ block_id: "block-1", score: 40, completed_at: "2026-07-29T12:00:00.000Z" }),
    ];
    const result = reduceLatestRolePlayResults(rows);
    expect(result.get("block-1")?.score).toBe(90);
    expect(result.size).toBe(1);
  });

  it("keeps the first row on a completed_at tie — ordering is entirely the caller's responsibility", () => {
    // This function does no sorting of its own; it trusts row order
    // completely. Two attempts CAN share a `completed_at` at this column's
    // precision, so the caller's query must break ties deterministically
    // (completed_at DESC, id DESC) — otherwise "most recent" would be
    // whatever order Postgres happened to return, which is not guaranteed
    // stable across calls. This test pins the reducer's half of that
    // contract: given a tie, it is still deterministic — first array
    // position wins — regardless of what completed_at says.
    const tiedAt = "2026-07-30T12:00:00.000Z";
    const rows = [
      row({ block_id: "block-1", score: 55, completed_at: tiedAt }),
      row({ block_id: "block-1", score: 91, completed_at: tiedAt }),
    ];
    const result = reduceLatestRolePlayResults(rows);
    expect(result.get("block-1")?.score).toBe(55);
    expect(result.size).toBe(1);
  });

  it("returns one entry per distinct block", () => {
    const rows = [
      row({ block_id: "block-1", score: 90 }),
      row({ block_id: "block-2", score: 60 }),
    ];
    const result = reduceLatestRolePlayResults(rows);
    expect(result.size).toBe(2);
    expect(result.get("block-2")?.score).toBe(60);
  });

  it("computes goals-met counts from the goals_met map", () => {
    const result = reduceLatestRolePlayResults([
      row({ goals_met: { a: true, b: true, c: false } }),
    ]);
    expect(result.get("block-1")).toMatchObject({
      goalsMetCount: 2,
      goalsTotalCount: 3,
    });
  });

  it("extracts summary_url from the summary jsonb, or null when absent", () => {
    expect(reduceLatestRolePlayResults([row({})]).get("block-1")?.summaryUrl).toBe(
      "https://lab.bmhgroupkc.com/embed/review/token",
    );
    expect(
      reduceLatestRolePlayResults([row({ summary: {} })]).get("block-1")?.summaryUrl,
    ).toBeNull();
    expect(
      reduceLatestRolePlayResults([row({ summary: null })]).get("block-1")?.summaryUrl,
    ).toBeNull();
  });

  it("coerces a numeric-string score (postgres numeric column) to a number", () => {
    expect(reduceLatestRolePlayResults([row({ score: "72" })]).get("block-1")?.score).toBe(72);
  });

  it("treats a null or unparsable score as null rather than throwing", () => {
    expect(reduceLatestRolePlayResults([row({ score: null })]).get("block-1")?.score).toBeNull();
    expect(
      reduceLatestRolePlayResults([row({ score: "not-a-number" })]).get("block-1")?.score,
    ).toBeNull();
  });

  it("treats missing/malformed goals_met as no objectives rather than throwing", () => {
    expect(
      reduceLatestRolePlayResults([row({ goals_met: null })]).get("block-1"),
    ).toMatchObject({ goalsMetCount: null, goalsTotalCount: null });
    expect(
      reduceLatestRolePlayResults([row({ goals_met: [] })]).get("block-1"),
    ).toMatchObject({ goalsMetCount: null, goalsTotalCount: null });
  });

  it("returns an empty map for no rows", () => {
    expect(reduceLatestRolePlayResults([]).size).toBe(0);
  });
});
