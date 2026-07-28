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

  it("never leaks the password in the resolved target", () => {
    const result = resolveProductionDbTarget(REAL);
    expect(JSON.stringify(result)).not.toContain("s3cret");
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
});
