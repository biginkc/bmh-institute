import { describe, expect, it, vi } from "vitest";

import {
  runVerifiedProductionDatabaseOperation,
  verifiedProductionPsqlEnvironment,
} from "../../../scripts/fixture-boundary/run-verified-production-db-operation";

const projectRef = "dhvfsyteqsxagokoerrx";
const poolerHost = "aws-1-us-east-1.pooler.supabase.com";
const canonicalUrl =
  `postgresql://postgres.${projectRef}:p%40ss%2Fword@${poolerHost}:5432/postgres`;

describe("verified production fixture-boundary database operation", () => {
  it.each([
    `postgresql://postgres.${projectRef}:secret@127.0.0.1:5432/postgres`,
    `postgresql://postgres.${projectRef}:secret@aws-1-us-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${projectRef}:secret@${poolerHost}.evil.example:5432/postgres`,
    `postgresql://postgres.jvaabkchkihkjllehmft:secret@${poolerHost}:5432/postgres`,
    `postgresql://postgres.${projectRef}:secret@${poolerHost}:6543/postgres`,
    `postgresql://postgres.${projectRef}:secret@${poolerHost}:5432/template1`,
    `postgresql://postgres.${projectRef}:secret@${poolerHost}:5432/postgres?sslmode=disable`,
  ])("refuses a noncanonical target before starting psql: %s", (databaseUrl) => {
    const spawnPsql = vi.fn(() => ({ status: 0 }));

    expect(() =>
      runVerifiedProductionDatabaseOperation(
        "disable",
        {
          FIXTURE_CLEANUP_PRODUCTION_DB_URL: databaseUrl,
          // A caller-supplied production ref must not make a different database safe.
          FIXTURE_CLEANUP_PROJECT_REF: projectRef,
        },
        spawnPsql,
      ),
    ).toThrow(/not the exact canonical/);
    expect(spawnPsql).not.toHaveBeenCalled();
  });

  it("maps the exact target to libpq fields and keeps credentials out of argv", () => {
    const spawnPsql = vi.fn((
      _command: string,
      _args: string[],
      _options: { env: NodeJS.ProcessEnv; stdio: "inherit" },
    ) => ({ status: 0 }));
    const secret = "controller-secret-that-must-not-be-an-argument";

    expect(
      runVerifiedProductionDatabaseOperation(
        "provision",
        {
          PATH: process.env.PATH,
          FIXTURE_CLEANUP_PRODUCTION_DB_URL: canonicalUrl,
          FIXTURE_CLEANUP_PROJECT_REF: "caller-controlled-value",
          FIXTURE_CLEANUP_CONTROLLER_KEY_ID: "production-key-v1",
          FIXTURE_CLEANUP_CONTROLLER_HMAC_SECRET: secret,
          PGHOST: "attacker.example",
          PGSERVICE: "caller-controlled-service",
        },
        spawnPsql,
      ),
    ).toBe(0);

    expect(spawnPsql).toHaveBeenCalledOnce();
    const [command, args, options] = spawnPsql.mock.calls[0];
    expect(command).toBe("psql");
    expect(args).toEqual([
      "-X",
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--file",
      expect.stringMatching(/provision-controller-key\.sql$/),
    ]);
    expect(args.join(" ")).not.toContain("p@ss/word");
    expect(args.join(" ")).not.toContain(secret);
    expect(options.env).toMatchObject({
      PGHOST: poolerHost,
      PGPORT: "5432",
      PGDATABASE: "postgres",
      PGUSER: `postgres.${projectRef}`,
      PGPASSWORD: "p@ss/word",
      PGSSLMODE: "require",
      FIXTURE_CLEANUP_PROJECT_REF: projectRef,
      FIXTURE_CLEANUP_CONTROLLER_KEY_ID: "production-key-v1",
      FIXTURE_CLEANUP_CONTROLLER_HMAC_SECRET: secret,
    });
    expect(options.env).not.toHaveProperty("PGSERVICE");
    expect(options.env).not.toHaveProperty("FIXTURE_CLEANUP_PRODUCTION_DB_URL");
  });

  it("requires an explicit canonical connection and operation", () => {
    const spawnPsql = vi.fn(() => ({ status: 0 }));
    expect(() => verifiedProductionPsqlEnvironment(undefined)).toThrow(
      /FIXTURE_CLEANUP_PRODUCTION_DB_URL is required/,
    );
    expect(() =>
      runVerifiedProductionDatabaseOperation(
        "toString",
        { FIXTURE_CLEANUP_PRODUCTION_DB_URL: canonicalUrl },
        spawnPsql,
      ),
    ).toThrow(/provision\|retire\|disable/);
    expect(spawnPsql).not.toHaveBeenCalled();
  });
});
