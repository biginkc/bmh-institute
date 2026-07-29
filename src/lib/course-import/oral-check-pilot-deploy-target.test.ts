import { describe, expect, it } from "vitest";

import {
  INSTITUTE_PRODUCTION_PROJECT_REF,
  resolveProductionDbTarget,
} from "./oral-check-pilot-deploy-target";

// Round-6 Codex review of PR #130, finding 4: the production-target preflight
// ran `supabase status`, which reports the LOCAL Supabase stack and can never
// say anything about which remote project a connection points at. The
// reviewer's specific escape route was that "a cloned test project containing
// the same release and catalog hash could therefore pass the SQL preflight and
// postflight while production remains untouched" -- so the identity check has
// to come from the connection itself, before any query is trusted.
//
// This is the pure half of that gate. Everything here is adversarial on
// purpose: the whole finding is that a look-alike target passed the old check,
// so a near miss must be refused rather than parsed generously.

const REAL =
  `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres`;

function expectRefused(url: string, reason: string) {
  const result = resolveProductionDbTarget(url);
  expect(result.ok, `must refuse: ${reason}`).toBe(false);
  if (!result.ok) {
    expect(result.error.length).toBeGreaterThan(0);
    // A refusal must never echo the password back to the operator or into CI
    // logs. The repo masks DB passwords everywhere else; this is the same rule.
    expect(result.error).not.toContain("s3cret");
    expect(result.error).not.toContain("hunter2");
  }
}

describe("resolveProductionDbTarget", () => {
  it("accepts the real Institute production pooler URL", () => {
    const result = resolveProductionDbTarget(REAL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.projectRef).toBe(INSTITUTE_PRODUCTION_PROJECT_REF);
      expect(result.host).toBe("aws-1-us-west-1.pooler.supabase.com");
      expect(result.user).toBe(`postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}`);
      expect(result.database).toBe("postgres");
    }
  });

  it("accepts the postgres:// scheme as well as postgresql://", () => {
    expect(resolveProductionDbTarget(REAL.replace("postgresql://", "postgres://")).ok).toBe(true);
  });

  it("confines the password to one dedicated field", () => {
    // Round-7 finding 3 changed this contract deliberately. The resolver now
    // returns the password so the caller can hand it to psql through
    // PGPASSWORD instead of putting the whole URL in argv, where Node would
    // echo it back inside any thrown execFileSync error. The invariant is no
    // longer "the password is absent" but "the password appears in exactly
    // one field, and every field a caller might print or pass along is free
    // of it".
    const result = resolveProductionDbTarget(REAL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.password).toBe("s3cret");
    const printable = { ...result, password: undefined };
    expect(JSON.stringify(printable)).not.toContain("s3cret");
  });

  it("refuses a different project ref", () => {
    expectRefused(
      "postgresql://postgres.jvaabkchkihkjllehmft:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
      "the BMH test project, which is a real project someone could plausibly be pointed at",
    );
  });

  it("refuses a connection with no project ref in the user", () => {
    expectRefused(
      "postgresql://postgres:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres",
      "a direct connection cannot prove which project it is",
    );
  });

  it("refuses a local or self-hosted connection", () => {
    expectRefused("postgresql://postgres:s3cret@127.0.0.1:5432/postgres", "localhost");
    expectRefused("postgresql://postgres:s3cret@localhost:54322/postgres", "the local Supabase stack");
  });

  it("refuses a look-alike host that merely contains the real one", () => {
    expectRefused(
      `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com.attacker.test:5432/postgres`,
      "suffixed host",
    );
    expectRefused(
      `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@notpooler.supabase.com:5432/postgres`,
      "host that is not a Supabase pooler host",
    );
  });

  it("refuses the ref appearing anywhere other than the user", () => {
    expectRefused(
      `postgresql://postgres:${INSTITUTE_PRODUCTION_PROJECT_REF}@aws-1-us-west-1.pooler.supabase.com:5432/postgres`,
      "ref smuggled into the password",
    );
    expectRefused(
      `postgresql://postgres:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/${INSTITUTE_PRODUCTION_PROJECT_REF}`,
      "ref smuggled into the database name",
    );
    expectRefused(
      `postgresql://postgres:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres?options=${INSTITUTE_PRODUCTION_PROJECT_REF}`,
      "ref smuggled into a query parameter",
    );
  });

  it("refuses a user that only starts or ends with the real ref", () => {
    expectRefused(
      `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}x:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres`,
      "ref with a trailing character",
    );
    expectRefused(
      `postgresql://postgres.x${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres`,
      "ref with a leading character",
    );
    expectRefused(
      `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}.extra:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres`,
      "extra dotted segment after the ref",
    );
  });

  it("refuses a non-postgres user even with the right ref", () => {
    expectRefused(
      `postgresql://admin.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres`,
      "the pooler user must be postgres.<ref>",
    );
  });

  it("refuses a database other than postgres", () => {
    expectRefused(
      `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/staging`,
      "wrong database on the right project",
    );
  });

  it("refuses a non-postgres scheme", () => {
    expectRefused(
      `https://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres`,
      "not a database URL",
    );
  });

  it("refuses empty, blank, and unparseable values", () => {
    for (const value of ["", "   ", "not a url", "postgresql://", "postgresql:///postgres"]) {
      const result = resolveProductionDbTarget(value);
      expect(result.ok, `must refuse: ${JSON.stringify(value)}`).toBe(false);
    }
  });

  it("refuses a ref that differs only by case", () => {
    expectRefused(
      `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF.toUpperCase()}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres`,
      "project refs are lowercase and must match exactly",
    );
  });

  // Round-7 Codex review, finding 2. The round-6 resolver validated the URL
  // authority and then passed the raw string through to the CLI. PostgreSQL
  // connection URIs accept query parameters including host, port, user and
  // dbname, and those OVERRIDE the authority. The reviewer demonstrated it:
  // an authority naming production plus
  // ?host=127.0.0.1&user=postgres.otherproject&dbname=otherdb passed the gate
  // and the CLI then connected to the override, so the postflight could only
  // notice after the wrong database had already been mutated.
  describe("query parameter and multi-host overrides (round-7 finding 2)", () => {
    it("refuses any query parameter at all, not just the dangerous ones", () => {
      expectRefused(
        `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres?host=127.0.0.1`,
        "host override",
      );
      expectRefused(
        `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres?user=postgres.otherproject`,
        "user override",
      );
      expectRefused(
        `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres?dbname=otherdb`,
        "dbname override",
      );
      expectRefused(
        `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres?port=1234`,
        "port override",
      );
      expectRefused(
        `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres?host=127.0.0.1&user=postgres.otherproject&dbname=otherdb`,
        "the reviewer's exact combined override",
      );
      // Even an apparently harmless parameter is refused. Allow-listing
      // individual parameters is how this class of bug comes back.
      expectRefused(
        `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres?application_name=deploy`,
        "any parameter",
      );
      expectRefused(
        `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres?`,
        "empty query string is still a query string",
      );
    });

    it("refuses a fragment", () => {
      expectRefused(
        `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres#host=127.0.0.1`,
        "fragment",
      );
    });

    it("refuses libpq multi-host syntax", () => {
      expectRefused(
        `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com,127.0.0.1:5432/postgres`,
        "comma separated hosts, where the second could win",
      );
    });

    it("refuses a trailing path segment beyond the database name", () => {
      expectRefused(
        `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com:5432/postgres/extra`,
        "path is the database name and nothing else",
      );
    });
  });

  // Round-7 Codex review, finding 3: the full URL was handed to the CLI as a
  // process argument, so the password reached argv and any thrown
  // execFileSync error message. The resolver now returns the pieces the caller
  // needs separately, so no caller has a reason to pass the raw string around.
  describe("credential separation (round-7 finding 3)", () => {
    it("returns a canonical URL that carries no password", () => {
      const result = resolveProductionDbTarget(REAL);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.canonicalUrlWithoutPassword).not.toContain("s3cret");
        expect(result.canonicalUrlWithoutPassword).toContain(
          INSTITUTE_PRODUCTION_PROJECT_REF,
        );
        expect(result.canonicalUrlWithoutPassword).toContain(
          "aws-1-us-west-1.pooler.supabase.com",
        );
        // Safe to print, so it must be printable in full.
        expect(result.canonicalUrlWithoutPassword).toMatch(/^postgresql:\/\//);
      }
    });

    it("exposes the password separately and decoded", () => {
      const encoded = REAL.replace("s3cret", encodeURIComponent("p@ss:word/1"));
      const result = resolveProductionDbTarget(encoded);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.password).toBe("p@ss:word/1");
        expect(result.canonicalUrlWithoutPassword).not.toContain("p@ss");
      }
    });

    it("refuses a connection with no password rather than silently proceeding", () => {
      expectRefused(
        `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}@aws-1-us-west-1.pooler.supabase.com:5432/postgres`,
        "no password means the apply would prompt or fail midway",
      );
    });

    it("resolves the port, defaulting when absent", () => {
      const withPort = resolveProductionDbTarget(REAL);
      expect(withPort.ok && withPort.port).toBe("5432");
      const withoutPort = resolveProductionDbTarget(
        `postgresql://postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}:s3cret@aws-1-us-west-1.pooler.supabase.com/postgres`,
      );
      expect(withoutPort.ok && withoutPort.port).toBe("5432");
    });
  });
});
