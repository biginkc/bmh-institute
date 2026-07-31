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

  it("renders a requested locked part before preparation can fall back", () => {
    // This decision now lives in resolveAndPrepareLearnerPart (the single
    // point the page delegates to for every ?part= request), not inlined in
    // page.tsx — see prepare-learner-part.ts and its tests.
    expect(source).toContain("resolveAndPrepareLearnerPart(");
    expect(preparationSource).toMatch(
      /const selected =\s*\n?\s*resolution\.requestedPartLocked\s*&&\s*resolution\.part\?\.kind === "quiz"\s*\?\s*resolution\.part\s*:\s*await prepareLearnerPart\(/,
    );
  });

  it("never redirects an unknown or locked part id to a different, available part", () => {
    // Regression guard for the bug where a bad ?part= value (unknown or
    // still-locked) silently redirected to the canonical fallback part
    // instead of rendering the "unavailable" outcome.
    expect(source).not.toContain("resolution.canonicalPartId");
    expect(source).not.toMatch(/redirect\(`\/lessons\/\$\{tile\.id\}\?part=/);
  });

  it("does not perform a second identity lookup for role-play blocks", () => {
    const helper = source.slice(source.indexOf("async function attachRolePlayEmbeds"));
    expect(helper).not.toContain("auth.getUser()");
    expect(helper).not.toContain('.from("profiles")');
  });

  it("orders the role-play results query by a deterministic tiebreaker", () => {
    // completed_at alone is not a unique key — two attempts can share a
    // timestamp at this column's precision. Without a secondary `id DESC`
    // sort, which row wins a tie in reduceLatestRolePlayResults's
    // first-row-wins reduction is undefined by Postgres, making "most
    // recent" accidental rather than guaranteed.
    const fetchFn = source.slice(source.indexOf("async function fetchLatestRolePlayResults"));
    const completedAtOrder = fetchFn.indexOf('.order("completed_at"');
    const idOrder = fetchFn.indexOf('.order("id"');
    expect(completedAtOrder).toBeGreaterThan(-1);
    expect(idOrder).toBeGreaterThan(completedAtOrder);
  });

  it("treats a role-play results query failure as distinct from zero rows", () => {
    // A query error must surface as failed:true, never collapse into the
    // same empty-map return as "no result row" — collapsing the two would
    // let a live database read failure masquerade as the (separately
    // defended, and per production data, currently unreachable) legacy gap
    // where a completed block has no matching row.
    const fetchFn = source.slice(
      source.indexOf("async function fetchLatestRolePlayResults"),
      source.indexOf("async function fetchLatestRolePlayResults") + 1500,
    );
    expect(fetchFn).toContain("if (error)");
    expect(fetchFn).toContain("failed: true");
    expect(fetchFn).toContain("console.error");
  });
});
