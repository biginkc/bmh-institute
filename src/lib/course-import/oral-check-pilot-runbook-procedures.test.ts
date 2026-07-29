import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Round-6 Codex review of PR #130, findings 1 and 4: the runbook's Andrea
// Oral Check pilot section documents two operator procedures that did not
// actually work as written.
//
// Finding 1 -- the emergency rollback snippet called
// fn_rollback_oral_check_pilot_role_play_blocks() without ever setting the
// service_role JWT claim, so the documented incident procedure would have
// failed with SQLSTATE 42501 ("requires service_role") the first time anyone
// ran it, during an actual incident, against 3 live published lessons. The
// function is correct; the documented invocation was not.
//
// Finding 4 -- the production-target preflight ran `supabase status`, which
// reports the LOCAL Supabase stack and can never prove which remote project a
// connection points at. The preflight has to interrogate the target database
// itself for facts only Institute production has, before any write.
//
// These are prose in a markdown file, so nothing else in the suite can catch
// a regression here. This test pins both procedures.

const RUNBOOK_PATH = resolve(
  process.cwd(),
  "docs/course-production/import-runbook.md",
);
const SECTION_HEADING = "### Andrea Oral Check pilot deployment";

function oralCheckPilotSection(): string {
  const runbook = readFileSync(RUNBOOK_PATH, "utf8");
  const start = runbook.indexOf(SECTION_HEADING);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextHeading = runbook.indexOf("\n## ", start);
  return nextHeading === -1 ? runbook.slice(start) : runbook.slice(start, nextHeading);
}

// Every fenced code block in the section, with its language tag.
function fencedBlocks(section: string): { language: string; body: string }[] {
  const blocks: { language: string; body: string }[] = [];
  for (const match of section.matchAll(/```([a-z]*)\n([\s\S]*?)```/g)) {
    blocks.push({ language: match[1], body: match[2] });
  }
  return blocks;
}

describe("Andrea Oral Check pilot runbook procedures", () => {
  const section = oralCheckPilotSection();
  const blocks = fencedBlocks(section);

  it("finds the section and its code blocks", () => {
    expect(section.length).toBeGreaterThan(1000);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
  });

  it("sets the service_role claim in every documented rollback invocation", () => {
    const rollbackBlocks = blocks.filter((block) =>
      block.body.includes("fn_rollback_oral_check_pilot_role_play_blocks()"),
    );
    expect(rollbackBlocks.length).toBeGreaterThanOrEqual(1);
    for (const block of rollbackBlocks) {
      const claimAt = block.body.indexOf("request.jwt.claim.role");
      const callAt = block.body.indexOf(
        "fn_rollback_oral_check_pilot_role_play_blocks()",
      );
      // The claim must be set, set to service_role, and set BEFORE the call.
      expect(claimAt).toBeGreaterThanOrEqual(0);
      expect(block.body).toMatch(
        /set_config\(\s*'request\.jwt\.claim\.role'\s*,\s*'service_role'/,
      );
      expect(claimAt).toBeLessThan(callAt);
    }
  });

  it("does not use supabase status to prove the production target", () => {
    // It must not appear in any runnable block. Prose that explicitly warns
    // an operator off it is the point, not a violation.
    for (const block of blocks) {
      expect(block.body).not.toContain("supabase status");
    }
    expect(section).toMatch(
      /(do not|don't|never)[^.]{0,80}`supabase status`/i,
    );
  });

  // Round-7 review, finding 1: the round-6 preflight asserted
  // current_user = 'postgres.<ref>'. That is the pooler routing username, not
  // the database role, which is plain postgres. The documented procedure could
  // therefore never have passed on the correct production connection.
  it("does not gate on the pooler routing username, which the session never sees", () => {
    for (const block of blocks) {
      expect(block.body).not.toMatch(/current_user\s*(<>|=)\s*'postgres\./);
      expect(block.body).not.toContain("'postgres.' || v_project_ref");
    }
  });

  it("gates on a value that provably identifies the cluster from inside the session", () => {
    const preflight = blocks.find(
      (block) => block.language === "sql" && block.body.includes("system_identifier"),
    );
    expect(preflight).toBeDefined();
    expect(preflight?.body).toContain("pg_control_system()");
    // The real Institute production cluster id, verified read-only.
    expect(preflight?.body).toContain("7626352619084395911");
    expect(preflight?.body).toContain("raise exception");
  });

  // Round-7 review, finding 4: the emergency rollback ran as raw SQL against
  // whichever connection the operator had, with no project verification and no
  // postflight, so during an incident it could report success against a clone.
  it("runs the emergency rollback through the same verified gate", () => {
    const rollbackSection = section.slice(section.indexOf("rollback becomes necessary"));
    expect(rollbackSection).toContain("--rollback");
    expect(rollbackSection).toContain("npm run course:oral-check:apply");
    expect(rollbackSection).toContain("--confirm=bmh-employee-training-v1");
  });

  it("proves the production target by querying the target database", () => {
    const preflightBlocks = blocks.filter(
      (block) =>
        block.language === "sql" &&
        block.body.includes("fn_course_import_catalog_sha256"),
    );
    expect(preflightBlocks.length).toBeGreaterThanOrEqual(1);
    const preflight = preflightBlocks[0].body;

    // The cluster's own identity, as reported by the target server. Round-7
    // finding 1 replaced the unusable current_user check with this.
    expect(preflight).toContain("pg_control_system()");
    // The exact production release the migration set targets.
    expect(preflight).toContain(
      "71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c",
    );
    // The exact live catalog state the forward migration is hash-pinned to.
    expect(preflight).toContain(
      "91bee07c6626d0d113291d925cfc7fa65ac26c57c7d85ea3ca172d5b706120f2",
    );
    expect(preflight).toContain("fn_course_import_catalog_sha256");
    // Fail closed: the preflight raises on any mismatch rather than printing
    // rows for a human to eyeball.
    expect(preflight).toContain("raise exception");
  });

  it("documents the executable gate as the path of record, not a pasted snippet", () => {
    // Round-6 finding 4's recommendation was an executable hard gate that
    // resolves the linked project URL, exits unless it is the production
    // project, and uses that SAME verified connection for preflight, apply,
    // and postflight. A runbook that only shows SQL leaves a window where the
    // connection verified and the connection written to are different.
    expect(section).toContain(
      "scripts/course-content/apply-oral-check-pilot-to-production.ts",
    );
    expect(section).toContain("npm run course:oral-check:apply");
    // The dry run must be documented as the default, and the write path must
    // carry the repo's established explicit-execute triple.
    expect(section).toContain("--execute");
    expect(section).toContain("--allow-production");
    expect(section).toContain("--confirm=bmh-employee-training-v1");
  });

  it("keeps the preflight ahead of the apply step in the documented order", () => {
    const preflightAt = section.indexOf("Target preflight");
    const applyAt = section.indexOf("Apply the 3 migrations to production");
    expect(preflightAt).toBeGreaterThanOrEqual(0);
    expect(applyAt).toBeGreaterThan(preflightAt);
  });
});
