import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PILOT_MIGRATIONS,
  assertLiveVerificationReceipt,
  assertPendingIsContiguousTail,
  buildPsqlEnv,
  scrub,
} from "../../../scripts/course-content/apply-oral-check-pilot-to-production";

// Round-7 Codex review, findings 3 and 6.
//
// Finding 6: the gate used `supabase db push --include-all`, which applies
// EVERY local migration missing from remote history, not only the three pilot
// migrations the runbook documents. A history gap or an unrelated new
// migration would have been swept into this rollout. The dry run also returned
// before ever computing a real plan, so an operator could not see what would
// actually happen.
//
// Finding 3: the full database URL was passed to that CLI through argv, so the
// production password reached the process list and any thrown execFileSync
// error message, which the catch block printed.
//
// Both are now structural: the apply set is a closed constant, and every
// string that can reach a log goes through the scrubber.

const SCRIPT_PATH = resolve(
  process.cwd(),
  "scripts/course-content/apply-oral-check-pilot-to-production.ts",
);

describe("pilot apply scope (round-7 finding 6)", () => {
  it("is a closed set of exactly the three documented migrations, in order", () => {
    expect(PILOT_MIGRATIONS.map((migration) => migration.version)).toEqual([
      "20260728020000",
      "20260728030000",
      "20260728050000",
    ]);
  });

  it("names migration files that actually exist on disk", () => {
    for (const migration of PILOT_MIGRATIONS) {
      const path = resolve(
        process.cwd(),
        "supabase/migrations",
        `${migration.version}_${migration.name}.sql`,
      );
      expect(existsSync(path), `${path} must exist`).toBe(true);
    }
  });

  it("never uses db push --include-all", () => {
    // Comments deliberately name the flag while explaining the finding, so
    // only executable lines are checked.
    const code = readFileSync(SCRIPT_PATH, "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("--include-all");
    // And does not shell out to the migration CLI at all, since that is what
    // pulled in unrelated migrations and required a URL in argv.
    expect(code).not.toContain('"db", "push"');
    expect(code).not.toContain("supabase db push");
  });

  it("accepts a full pending set and any contiguous tail of it", () => {
    expect(() => assertPendingIsContiguousTail([...PILOT_MIGRATIONS])).not.toThrow();
    expect(() => assertPendingIsContiguousTail(PILOT_MIGRATIONS.slice(1))).not.toThrow();
    expect(() => assertPendingIsContiguousTail(PILOT_MIGRATIONS.slice(2))).not.toThrow();
    expect(() => assertPendingIsContiguousTail([])).not.toThrow();
  });

  it("refuses a partial remote state that would apply the pilot out of order", () => {
    // The dangerous one: the apply migration is missing remotely but so is its
    // predecessor rollback capability, and they would be applied in an order
    // that does not match the closed set. Applying 20260728050000 without
    // 20260728030000 already present is the exact incident state the 3-file
    // split exists to prevent.
    expect(() =>
      assertPendingIsContiguousTail([
        { version: "20260728020000" },
        { version: "20260728050000" },
      ]),
    ).toThrow(/unexpected partial state/);
    expect(() =>
      assertPendingIsContiguousTail([{ version: "20260728020000" }]),
    ).toThrow(/unexpected partial state/);
    expect(() =>
      assertPendingIsContiguousTail([{ version: "20260728030000" }]),
    ).toThrow(/unexpected partial state/);
    expect(() =>
      assertPendingIsContiguousTail([{ version: "20260101000000" }]),
    ).toThrow(/unexpected partial state/);
  });
});

describe("credential scrubbing (round-7 finding 3)", () => {
  it("redacts every occurrence of a secret", () => {
    const secret = "s3cret";
    const message = `psql: error: connection to postgresql://u:${secret}@host/db failed, ${secret}`;
    const scrubbed = scrub(message, [secret]);
    expect(scrubbed).not.toContain(secret);
    expect(scrubbed.match(/\[redacted\]/g)?.length).toBe(2);
  });

  it("redacts a whole connection string when that is what it is given", () => {
    const url = "postgresql://postgres.dhvfsyteqsxagokoerrx:p@ss@host:5432/postgres";
    expect(scrub(`spawn failed running ${url}`, [url])).not.toContain("p@ss");
  });

  it("leaves other text intact and tolerates empty secrets", () => {
    expect(scrub("nothing to hide", [""])).toBe("nothing to hide");
    expect(scrub("nothing to hide", [])).toBe("nothing to hide");
  });

  it("handles regex-special characters in a password literally", () => {
    const secret = "a.*b$c(d)";
    expect(scrub(`fail ${secret} end`, [secret])).toBe("fail [redacted] end");
    // A password of regex metacharacters must not accidentally redact text
    // that merely matches it as a pattern.
    expect(scrub("axxbXcYdZ", [secret])).toBe("axxbXcYdZ");
  });
});

// Round-8 review, findings 1, 2, 3 and 5.
describe("pre-migration safety of the preflight (round-8 finding 1)", () => {
  const source = readFileSync(SCRIPT_PATH, "utf8");

  it("never references the pilot receipt tables without a to_regclass guard", () => {
    // The blocker: content_import_oral_check_pilot_role_play_records is
    // CREATED by 20260728020000, so on genuinely fresh production, which is
    // our real case, a direct reference makes the statement fail to parse and
    // the whole gate raises undefined_table before applying anything.
    // Verified read-only against production: to_regclass on that table returns
    // null there. Any reference must therefore be inside dynamic SQL behind an
    // existence check.
    const pilotTables = [
      "content_import_oral_check_pilot_role_play_records",
      "content_import_oral_check_pilot_role_play_rollback_records",
    ];
    for (const table of pilotTables) {
      const guarded = source.includes(`to_regclass('public.${table}')`);
      expect(guarded, `${table} must be guarded by to_regclass`).toBe(true);
    }
    // Static (non-dynamic) references are only allowed in the postflight,
    // which by definition runs after the migrations exist.
    const preflight = source.slice(
      source.indexOf("const PREFLIGHT_SQL"),
      source.indexOf("const STATE_SQL"),
    );
    for (const table of pilotTables) {
      expect(preflight).not.toContain(table);
    }
  });

  it("reads the receipt through dynamic SQL so parsing cannot fail", () => {
    const state = source.slice(
      source.indexOf("const STATE_SQL"),
      source.indexOf("const APPLY_POSTFLIGHT_SQL"),
    );
    expect(state).toContain("execute format(");
    expect(state).toContain("to_regclass(");
    // All three outcomes must exist, since finding 3 depends on telling them
    // apart.
    expect(state).toContain("'fresh'");
    expect(state).toContain("'applied'");
    expect(state).toContain("inconsistent");
  });
});

describe("session hygiene (round-8 finding 2)", () => {
  const source = readFileSync(SCRIPT_PATH, "utf8");

  it("passes -X to every psql invocation so startup files cannot run", () => {
    expect(source).toContain('"-X"');
    const invocations = source.match(/execFileSync\("psql"/g) ?? [];
    expect(invocations.length).toBe(1);
  });

  it("re-asserts identity inside every session that writes", () => {
    // A one-time check in an earlier session cannot vouch for a later
    // connection. Both writing paths embed the identity assertion.
    const applyFn = source.slice(source.indexOf("function applyPilotMigrations"));
    expect(applyFn.slice(0, applyFn.indexOf("\n}\n"))).toContain("IDENTITY_SQL");
    const rollbackSql = source.slice(
      source.indexOf("const ROLLBACK_SQL"),
      source.indexOf("const ROLLBACK_STATE_SQL"),
    );
    expect(rollbackSql).toContain("${IDENTITY_SQL}");
    // And it must be inside the transaction, before the mutating call.
    expect(rollbackSql.indexOf("begin;")).toBeLessThan(rollbackSql.indexOf("${IDENTITY_SQL}"));
    expect(rollbackSql.indexOf("${IDENTITY_SQL}")).toBeLessThan(
      rollbackSql.indexOf("fn_rollback_oral_check_pilot_role_play_blocks()"),
    );
  });

  it("clears every inherited libpq variable that can redirect a connection", () => {
    const target = {
      host: "aws-1-us-west-1.pooler.supabase.com",
      port: "5432",
      user: "postgres.dhvfsyteqsxagokoerrx",
      password: "s3cret",
      database: "postgres",
    };
    const hostile = {
      PATH: "/usr/bin",
      PGSERVICE: "someone-elses-service",
      PGSERVICEFILE: "/tmp/evil.conf",
      PGHOSTADDR: "127.0.0.1",
      PGOPTIONS: "-c search_path=evil",
      PGPASSFILE: "/tmp/evil.pgpass",
      PGSSLROOTCERT: "/tmp/evil.crt",
      PSQLRC: "/tmp/evil.psqlrc",
      PGDATABASE: "otherdb",
      PGHOST: "evil.example.com",
      PGUSER: "postgres.otherproject",
    } as unknown as NodeJS.ProcessEnv;
    const env = buildPsqlEnv(hostile, target);

    for (const name of [
      "PGSERVICE",
      "PGSERVICEFILE",
      "PGHOSTADDR",
      "PGOPTIONS",
      "PGPASSFILE",
      "PGSSLROOTCERT",
      "PSQLRC",
    ]) {
      expect(env[name], `${name} must not survive into the child`).toBeUndefined();
    }
    // And the resolved target wins over anything inherited.
    expect(env.PGHOST).toBe(target.host);
    expect(env.PGUSER).toBe(target.user);
    expect(env.PGDATABASE).toBe("postgres");
    expect(env.PGSSLMODE).toBe("require");
    // Unrelated variables are left alone.
    expect(env.PATH).toBe("/usr/bin");
  });
});

describe("live verification evidence gate (round-8 finding 5)", () => {
  const attestationSha256 = "a".repeat(64);
  const now = Date.parse("2026-07-29T12:00:00Z");
  const good = {
    verified_at: "2026-07-29T11:00:00Z",
    attestation_sha256: attestationSha256,
    documents_byte_verified: 12,
  };

  it("accepts a fresh receipt for the current attestation", () => {
    expect(() =>
      assertLiveVerificationReceipt(good, attestationSha256, now),
    ).not.toThrow();
  });

  it("refuses a missing or unreadable receipt", () => {
    // This is the actual finding: the verifier exits SUCCESS with the live
    // case SKIPPED when credentials are absent, so without this the apply
    // proceeds having hashed zero production documents.
    expect(() => assertLiveVerificationReceipt(null, attestationSha256, now)).toThrow(
      /missing or unreadable/,
    );
    expect(() => assertLiveVerificationReceipt("nope", attestationSha256, now)).toThrow();
  });

  it("refuses a receipt produced against a different attestation", () => {
    expect(() =>
      assertLiveVerificationReceipt(good, "b".repeat(64), now),
    ).toThrow(/different attestation/);
  });

  it("refuses a receipt that did not hash every document", () => {
    expect(() =>
      assertLiveVerificationReceipt(
        { ...good, documents_byte_verified: 11 },
        attestationSha256,
        now,
      ),
    ).toThrow(/documents byte-verified/);
    expect(() =>
      assertLiveVerificationReceipt(
        { ...good, documents_byte_verified: 0 },
        attestationSha256,
        now,
      ),
    ).toThrow();
  });

  it("refuses a stale receipt", () => {
    expect(() =>
      assertLiveVerificationReceipt(
        { ...good, verified_at: "2026-07-27T11:00:00Z" },
        attestationSha256,
        now,
      ),
    ).toThrow(/older than/);
  });

  it("refuses an unreadable or future timestamp", () => {
    expect(() =>
      assertLiveVerificationReceipt({ ...good, verified_at: "whenever" }, attestationSha256, now),
    ).toThrow(/verified_at/);
    expect(() =>
      assertLiveVerificationReceipt(
        { ...good, verified_at: "2026-07-30T11:00:00Z" },
        attestationSha256,
        now,
      ),
    ).toThrow(/future/);
  });

  it("tells the operator exactly how to produce a valid receipt", () => {
    try {
      assertLiveVerificationReceipt(null, attestationSha256, now);
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toContain("BMH_INSTITUTE_ALLOW_LIVE_CLOSER_LAB_VERIFICATION=1");
    }
  });
});

// Round-9 review, findings 2 and 3.
describe("recovery cannot falsely certify drifted state (round-9 finding 2)", () => {
  const source = readFileSync(SCRIPT_PATH, "utf8");
  const applyPostflight = source.slice(
    source.indexOf("const APPLY_POSTFLIGHT_SQL"),
    source.indexOf("// Round-7 finding 4. The rollback function"),
  );
  const rollbackPostflight = source.slice(
    source.indexOf("const ROLLBACK_POSTFLIGHT_SQL"),
    source.indexOf("function requiredEnv"),
  );

  it("re-derives the catalog checksum and compares it to the receipt", () => {
    // Presence of three rows with the right ids proves nothing about their
    // content or about the rest of the catalog. The receipt records what the
    // operation actually produced, so that is the thing to compare against.
    expect(applyPostflight).toContain("fn_course_import_catalog_sha256");
    expect(applyPostflight).toContain("v_forward.replacement_catalog_sha256");
    expect(rollbackPostflight).toContain("fn_course_import_catalog_sha256");
    expect(rollbackPostflight).toContain("v_forward.prior_catalog_sha256");
  });

  it("compares every live row against the receipt's own recorded payload", () => {
    // Same shape the rollback function uses: content, lesson, order and the
    // required flag, matched per recorded mutation rather than by id alone.
    expect(applyPostflight).toContain("jsonb_array_elements(v_forward.mutations)");
    expect(applyPostflight).toContain("block.content = mutation.value -> 'content'");
    expect(applyPostflight).toContain("block.lesson_id =");
    expect(applyPostflight).toContain("block.sort_order =");
    expect(applyPostflight).toContain("block.is_required_for_completion = true");
  });

  it("refuses extra pilot rows beyond the three recorded", () => {
    expect(applyPostflight).toMatch(/v_present <> 3/);
  });

  it("requires the forward receipt to exist before certifying a rollback", () => {
    expect(rollbackPostflight).toContain(
      "no forward evidence receipt exists, so there is nothing to have rolled back",
    );
  });
});

describe("applied recovery still validates migration history (round-9 finding 3)", () => {
  const source = readFileSync(SCRIPT_PATH, "utf8");

  it("runs the version and name plan before the applied branch returns", () => {
    const planAt = source.indexOf("const { pending, alreadyApplied } = planPilotMigrations(target);");
    const appliedBranchAt = source.indexOf('if (state === "applied")');
    const preflightAt = source.indexOf("runSql(target, PREFLIGHT_SQL);");
    expect(planAt).toBeGreaterThan(-1);
    expect(appliedBranchAt).toBeGreaterThan(-1);
    // The plan, which validates all three version/name pairs, must run before
    // either branch can declare success.
    expect(planAt).toBeLessThan(appliedBranchAt);
    expect(planAt).toBeLessThan(preflightAt);
  });

  it("refuses to certify live blocks whose migration history is missing", () => {
    const appliedBranch = source.slice(
      source.indexOf('if (state === "applied")'),
      source.indexOf("// Phase 5: preflight."),
    );
    expect(appliedBranch).toContain("pending.length > 0");
    expect(appliedBranch).toContain("Refusing to certify this target");
    // And the refusal must precede the postflight, not follow it.
    expect(appliedBranch.indexOf("Refusing to certify this target")).toBeLessThan(
      appliedBranch.indexOf("APPLY_POSTFLIGHT_SQL"),
    );
  });
});

describe("live verification receipt lifecycle (round-9 finding 1)", () => {
  const verifier = readFileSync(
    resolve(process.cwd(), "content/course-manifests/oral-check-pilot-production-attestation.qa.test.mjs"),
    "utf8",
  );

  it("deletes any existing receipt before re-verifying", () => {
    // Otherwise "verified clean, production drifted, recheck failed" leaves
    // the earlier receipt valid for up to 24 hours and the apply accepts it.
    const liveTest = verifier.slice(
      verifier.indexOf("test(\"live recheck:"),
      verifier.indexOf("// Round-6 Codex review, finding 5, the part that is easy"),
    );
    const rmAt = liveTest.indexOf("await rm(RECEIPT_URL");
    const fetchAt = liveTest.indexOf("await fetch(");
    expect(rmAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(-1);
    expect(rmAt).toBeLessThan(fetchAt);
  });

  it("writes the receipt only when the whole process exits clean", () => {
    expect(verifier).toContain("let stagedReceipt = null;");
    expect(verifier).toContain('process.on("exit"');
    expect(verifier).toContain("process.exitCode !== 0");
    // The live test must stage, never write directly.
    const liveTest = verifier.slice(
      verifier.indexOf("test(\"live recheck:"),
      verifier.indexOf("// Round-6 Codex review, finding 5, the part that is easy"),
    );
    expect(liveTest).toContain("stagedReceipt = {");
    expect(liveTest).not.toContain("writeFileSync(RECEIPT_URL");
  });

  it("hashes the same attestation read it compares against", () => {
    // A second independent read lets an edit land in between and bind the
    // receipt to bytes that were never verified.
    expect(verifier).toContain("const attestationBytes = await readFile(ATTESTATION_URL);");
    expect(verifier).toContain(
      "createHash(\"sha256\").update(attestationBytes).digest(\"hex\")",
    );
    expect(verifier).toContain("JSON.parse(attestationBytes.toString(\"utf8\"))");
    const liveTest = verifier.slice(
      verifier.indexOf("test(\"live recheck:"),
      verifier.indexOf("// Round-6 Codex review, finding 5, the part that is easy"),
    );
    // No second read of the attestation inside the live path.
    expect(liveTest).not.toContain("await loadAttestation()");
  });
});
