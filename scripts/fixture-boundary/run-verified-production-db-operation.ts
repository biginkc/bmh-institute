#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PRODUCTION_PROJECT_REF = "dhvfsyteqsxagokoerrx";
const PRODUCTION_POOLER_HOST = "aws-1-us-west-1.pooler.supabase.com";
const PRODUCTION_POOLER_USER = `postgres.${PRODUCTION_PROJECT_REF}`;
const PRODUCTION_DATABASE = "postgres";
const PRODUCTION_PORT = "5432";
const DATABASE_URL_ENV = "FIXTURE_CLEANUP_PRODUCTION_DB_URL";

const operationScripts = {
  provision: "provision-controller-key.sql",
  retire: "retire-controller-key.sql",
  disable: "disable-controller-gated-cleanup.sql",
} as const;

export type FixtureBoundaryDatabaseOperation = keyof typeof operationScripts;

type SpawnResult = {
  error?: Error;
  status: number | null;
};

type SpawnPsql = (
  command: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv;
    stdio: "inherit";
  },
) => SpawnResult;

type Environment = Readonly<Record<string, string | undefined>>;

type PsqlEnvironment = {
  PGHOST: string;
  PGPORT: string;
  PGDATABASE: string;
  PGUSER: string;
  PGPASSWORD: string;
  PGSSLMODE: "require";
};

export function verifiedProductionPsqlEnvironment(
  value: string | undefined,
): PsqlEnvironment {
  if (!value?.trim()) {
    throw new Error(
      `Refusing fixture-boundary operation: ${DATABASE_URL_ENV} is required.`,
    );
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(value);
  } catch {
    throw new Error(
      `Refusing fixture-boundary operation: ${DATABASE_URL_ENV} is not a valid URL.`,
    );
  }

  let username: string;
  let password: string;
  let pathname: string;
  try {
    username = decodeURIComponent(databaseUrl.username);
    password = decodeURIComponent(databaseUrl.password);
    pathname = decodeURIComponent(databaseUrl.pathname);
  } catch {
    throw new Error(
      `Refusing fixture-boundary operation: ${DATABASE_URL_ENV} contains invalid encoding.`,
    );
  }

  const queryKeys = [...databaseUrl.searchParams.keys()];
  const hasOnlyOptionalTlsQuery =
    queryKeys.length === 0 ||
    (queryKeys.length === 1 &&
      queryKeys[0] === "sslmode" &&
      databaseUrl.searchParams.get("sslmode") === "require");
  const isCanonicalTarget =
    ["postgres:", "postgresql:"].includes(databaseUrl.protocol) &&
    username === PRODUCTION_POOLER_USER &&
    password.length > 0 &&
    databaseUrl.hostname === PRODUCTION_POOLER_HOST &&
    databaseUrl.port === PRODUCTION_PORT &&
    pathname === `/${PRODUCTION_DATABASE}` &&
    databaseUrl.hash === "" &&
    hasOnlyOptionalTlsQuery;

  if (!isCanonicalTarget) {
    throw new Error(
      "Refusing fixture-boundary operation: the database URL is not the exact canonical BMH Institute production Supabase connection target.",
    );
  }

  return {
    PGHOST: PRODUCTION_POOLER_HOST,
    PGPORT: PRODUCTION_PORT,
    PGDATABASE: PRODUCTION_DATABASE,
    PGUSER: PRODUCTION_POOLER_USER,
    PGPASSWORD: password,
    PGSSLMODE: "require",
  };
}

export function runVerifiedProductionDatabaseOperation(
  operation: string | undefined,
  env: Environment = process.env,
  spawnPsql: SpawnPsql = spawnSync,
): number {
  if (
    !operation ||
    !Object.prototype.hasOwnProperty.call(operationScripts, operation)
  ) {
    throw new Error(
      "Usage: run-verified-production-db-operation.ts <provision|retire|disable>",
    );
  }

  const psqlEnvironment = verifiedProductionPsqlEnvironment(
    env[DATABASE_URL_ENV],
  );
  const script = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    operationScripts[operation as FixtureBoundaryDatabaseOperation],
  );
  const childEnv: NodeJS.ProcessEnv = {
    NODE_ENV: ["development", "test"].includes(env.NODE_ENV ?? "")
      ? (env.NODE_ENV as "development" | "test")
      : "production",
    PATH: env.PATH,
    LANG: env.LANG,
    LC_ALL: env.LC_ALL,
    ...psqlEnvironment,
    // The SQL utilities retain their defense-in-depth check, but this value is
    // derived from the connection contract rather than trusted caller input.
    FIXTURE_CLEANUP_PROJECT_REF: PRODUCTION_PROJECT_REF,
  };

  if (operation === "provision") {
    childEnv.FIXTURE_CLEANUP_CONTROLLER_KEY_ID =
      env.FIXTURE_CLEANUP_CONTROLLER_KEY_ID;
    childEnv.FIXTURE_CLEANUP_CONTROLLER_HMAC_SECRET =
      env.FIXTURE_CLEANUP_CONTROLLER_HMAC_SECRET;
  } else if (operation === "retire") {
    childEnv.FIXTURE_CLEANUP_CONTROLLER_KEY_ID =
      env.FIXTURE_CLEANUP_CONTROLLER_KEY_ID;
  }

  const result = spawnPsql(
    "psql",
    ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--file", script],
    { env: childEnv, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  try {
    process.exitCode = runVerifiedProductionDatabaseOperation(process.argv[2]);
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Fixture-boundary operation failed.",
    );
    process.exitCode = 1;
  }
}
