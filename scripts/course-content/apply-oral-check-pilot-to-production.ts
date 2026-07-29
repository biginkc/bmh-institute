// Executable hard gate for the Andrea Oral Check pilot deployment and its
// emergency rollback.
//
// Round-6 review, finding 4 asked for an executable gate that resolves the
// linked project, refuses anything that is not dhvfsyteqsxagokoerrx, and uses
// that same verified connection for preflight, apply, and postflight. Round-7
// review then found four real defects in the first version of that gate, all
// fixed here:
//
//   finding 1  The preflight asserted current_user = 'postgres.<ref>'. That is
//              the pooler ROUTING username, not the database role. Verified
//              read-only against both real projects: current_user is plain
//              `postgres`, so the documented dry run and apply would have
//              failed on the intended production connection before reaching a
//              migration. The in-session identity check is now
//              pg_control_system().system_identifier, which is the cluster's
//              own unique id, is readable by the postgres role, and actually
//              differs between projects.
//   finding 2  Query parameters bypassed the target gate. Handled in
//              resolveProductionDbTarget, which now refuses parameters and
//              rebuilds the connection from validated parts.
//   finding 3  The full URL went to `supabase db push` through argv, so the
//              password reached the process list and any thrown execFileSync
//              error message, which the catch block printed. Nothing here puts
//              a credential in argv now: psql is driven entirely through PG*
//              environment variables, and all output is scrubbed before it is
//              printed.
//   finding 6  `db push --include-all` applies every local migration missing
//              from remote history, not only the three pilot migrations. It
//              also meant the dry run never showed a real plan. This applies
//              exactly the three pilot files by name, refuses a partial or
//              out-of-order remote state, and the dry run prints the true
//              remote-versus-local plan.
//
// Round-7 finding 4 added the rollback to this gate's scope. The emergency
// procedure used to be raw SQL against whatever connection the operator had,
// with no project verification and no postflight, so during an incident it
// could report success against a clone while production stayed broken.
//
// Usage:
//   BMH_INSTITUTE_PRODUCTION_DB_URL=... npm run course:oral-check:apply
//   BMH_INSTITUTE_PRODUCTION_DB_URL=... npm run course:oral-check:apply -- \
//     --execute --allow-production --confirm=bmh-employee-training-v1
//   BMH_INSTITUTE_PRODUCTION_DB_URL=... npm run course:oral-check:apply -- \
//     --rollback --execute --allow-production --confirm=bmh-employee-training-v1

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INSTITUTE_PRODUCTION_DB_ROLE,
  INSTITUTE_PRODUCTION_PROJECT_REF,
  INSTITUTE_PRODUCTION_SYSTEM_IDENTIFIER,
  resolveProductionDbTarget,
  type ProductionDbTarget,
} from "../../src/lib/course-import/oral-check-pilot-deploy-target";

const IMPORT_ID = "bmh-employee-training-v1";
const EXPECTED_PROGRAM_ID = "15a382c9-617c-5407-a880-af6303be74b2";
const EXPECTED_MANIFEST_SHA256 =
  "71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c";
const EXPECTED_CATALOG_SHA256 =
  "91bee07c6626d0d113291d925cfc7fa65ac26c57c7d85ea3ca172d5b706120f2";
const EXPECTED_BLOCK_IDS = [
  "7300bba9-a9fc-582c-aa20-dd5d58754165",
  "4464ecdd-2650-59ed-a525-78871e846d20",
  "34758403-1ddd-5e3c-a054-b2f28310d8b8",
];

// Round-7 finding 6: the exact, closed set. Applied in this order, and nothing
// else is applied, whatever else may or may not be present locally.
export const PILOT_MIGRATIONS = [
  { version: "20260728020000", name: "insert_oral_check_pilot_role_play_blocks" },
  { version: "20260728030000", name: "rollback_oral_check_pilot_role_play_blocks" },
  { version: "20260728050000", name: "apply_oral_check_pilot_role_play_blocks" },
] as const;

const BLOCK_ID_LIST = EXPECTED_BLOCK_IDS.map((id) => `'${id}'`).join(", ");

// Round-7 finding 1. Asserts the cluster's own unique identifier rather than a
// routing username the session never sees. Runs first in every mode, including
// the rollback, so no mode can act on an unverified target.
const IDENTITY_SQL = `
do $$
declare
  v_system_identifier text;
  v_role text := current_user;
begin
  begin
    select system_identifier::text into v_system_identifier from pg_control_system();
  exception when others then
    raise exception 'target identity failed: could not read pg_control_system(). Refusing rather than proceeding on an unverified target. (%)', sqlerrm;
  end;
  if v_system_identifier is distinct from '${INSTITUTE_PRODUCTION_SYSTEM_IDENTIFIER}' then
    raise exception 'target identity failed: this cluster reports system_identifier %, expected ${INSTITUTE_PRODUCTION_SYSTEM_IDENTIFIER} (BMH Institute production, project ${INSTITUTE_PRODUCTION_PROJECT_REF}). Refusing before any write.', v_system_identifier;
  end if;
  if v_role is distinct from '${INSTITUTE_PRODUCTION_DB_ROLE}' then
    raise exception 'target identity failed: connected as database role %, expected ${INSTITUTE_PRODUCTION_DB_ROLE}.', v_role;
  end if;
  raise notice 'target identity ok: system_identifier %, role %', v_system_identifier, v_role;
end;
$$;
`;

const PREFLIGHT_SQL = `
do $$
declare
  v_live_catalog_sha256 text;
begin
  if not exists (
    select 1 from public.content_import_release_records
    where import_id = '${IMPORT_ID}'
      and program_id = '${EXPECTED_PROGRAM_ID}'
      and manifest_sha256 = '${EXPECTED_MANIFEST_SHA256}'
  ) then
    raise exception 'preflight failed: no ${IMPORT_ID} release record matching the exact production program and manifest pin. Wrong target, incomplete restore, or the catalog was never released.';
  end if;
  v_live_catalog_sha256 := public.fn_course_import_catalog_sha256('${IMPORT_ID}');
  if v_live_catalog_sha256 <> '${EXPECTED_CATALOG_SHA256}' then
    raise exception 'preflight failed: live catalog hashes to %, the migration is pinned to ${EXPECTED_CATALOG_SHA256}. Either this is not the production catalog, or production has drifted since the pin was taken and the migration must be re-authored.', v_live_catalog_sha256;
  end if;
  if exists (
    select 1 from public.content_import_oral_check_pilot_role_play_records
    where import_id = '${IMPORT_ID}'
  ) then
    raise exception 'preflight failed: the pilot insertion receipt already exists on this target. This is a one-shot operation and has already been performed.';
  end if;
  raise notice 'preflight ok';
end;
$$;
`;

const APPLY_POSTFLIGHT_SQL = `
do $$
declare
  v_receipts integer;
  v_blocks integer;
begin
  select count(*) into v_receipts
  from public.content_import_oral_check_pilot_role_play_records
  where import_id = '${IMPORT_ID}' and role_play_insert_count = 3;
  if v_receipts <> 1 then
    raise exception 'postflight failed: expected exactly 1 evidence receipt with role_play_insert_count = 3, found %', v_receipts;
  end if;
  select count(*) into v_blocks
  from public.content_blocks
  where id in (${BLOCK_ID_LIST})
    and block_type = 'role_play'
    and is_required_for_completion;
  if v_blocks <> 3 then
    raise exception 'postflight failed: expected exactly 3 required role_play blocks, found %', v_blocks;
  end if;
  raise notice 'postflight ok';
end;
$$;
`;

// Round-7 finding 4. The rollback function requires the service_role claim,
// which a direct psql session does not acquire from holding service-role
// credentials. Transaction-scoped, exactly as the runbook documents.
const ROLLBACK_SQL = `
begin;
set local lock_timeout = '10s';
select set_config('request.jwt.claim.role', 'service_role', true);
select public.fn_rollback_oral_check_pilot_role_play_blocks();
commit;
`;

const ROLLBACK_POSTFLIGHT_SQL = `
do $$
declare
  v_rollback_receipts integer;
  v_blocks integer;
begin
  select count(*) into v_rollback_receipts
  from public.content_import_oral_check_pilot_role_play_rollback_records
  where import_id = '${IMPORT_ID}' and role_play_removed_count = 3;
  if v_rollback_receipts <> 1 then
    raise exception 'rollback postflight failed: expected exactly 1 rollback receipt with role_play_removed_count = 3, found %', v_rollback_receipts;
  end if;
  select count(*) into v_blocks
  from public.content_blocks where id in (${BLOCK_ID_LIST});
  if v_blocks <> 0 then
    raise exception 'rollback postflight failed: expected 0 remaining pilot blocks, found %', v_blocks;
  end if;
  raise notice 'rollback postflight ok';
end;
$$;
`;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

// Round-7 finding 3. Any string that reaches a log or an error goes through
// here first. Belt and braces on top of never putting the credential in argv.
export function scrub(text: string, secrets: readonly string[]): string {
  let scrubbed = text;
  for (const secret of secrets) {
    if (secret.length > 0) {
      scrubbed = scrubbed.split(secret).join("[redacted]");
    }
  }
  return scrubbed;
}

// psql is driven entirely through PG* environment variables, so no credential
// is ever a process argument.
function psqlEnv(target: ProductionDbTarget): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PGHOST: target.host,
    PGPORT: target.port,
    PGUSER: target.user,
    PGPASSWORD: target.password,
    PGDATABASE: target.database,
    PGSSLMODE: "require",
  };
}

function runPsql(target: ProductionDbTarget, args: readonly string[]): string {
  try {
    return execFileSync("psql", ["--set", "ON_ERROR_STOP=1", ...args], {
      env: psqlEnv(target),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stdout = (error as { stdout?: Buffer | string }).stdout ?? "";
    const stderr = (error as { stderr?: Buffer | string }).stderr ?? "";
    const raw = `${error instanceof Error ? error.message : String(error)}\n${stdout}\n${stderr}`;
    throw new Error(scrub(raw, [target.password]));
  }
}

function runSql(target: ProductionDbTarget, sql: string): string {
  return runPsql(target, ["--command", sql]);
}

function scalar(target: ProductionDbTarget, sql: string): string {
  return runPsql(target, ["--tuples-only", "--no-align", "--command", sql]).trim();
}

function migrationPath(version: string, name: string): string {
  return resolve(process.cwd(), "supabase/migrations", `${version}_${name}.sql`);
}

/**
 * Round-7 finding 6: the real plan, computed from remote history rather than
 * assumed. Returns only the pilot migrations genuinely missing remotely.
 */
function planPilotMigrations(target: ProductionDbTarget): {
  readonly pending: readonly { version: string; name: string }[];
  readonly alreadyApplied: readonly string[];
} {
  const versionList = PILOT_MIGRATIONS.map((migration) => `'${migration.version}'`).join(", ");
  const applied = scalar(
    target,
    `select coalesce(string_agg(version, ',' order by version), '') from supabase_migrations.schema_migrations where version in (${versionList});`,
  );
  const appliedVersions = applied.length > 0 ? applied.split(",") : [];
  const pending = PILOT_MIGRATIONS.filter(
    (migration) => !appliedVersions.includes(migration.version),
  );
  return { pending, alreadyApplied: appliedVersions };
}

/**
 * Round-7 finding 6: the pilot migrations must be a contiguous tail of the
 * closed set. Applying 20260728050000 without its two predecessors already
 * present is the exact incident state the 3-file split exists to prevent.
 */
export function assertPendingIsContiguousTail(
  pending: readonly { version: string }[],
): void {
  const expected = PILOT_MIGRATIONS.slice(PILOT_MIGRATIONS.length - pending.length);
  const mismatch = pending.some(
    (migration, index) => migration.version !== expected[index]?.version,
  );
  if (mismatch) {
    throw new Error(
      `Remote history has the pilot migrations in an unexpected partial state (missing ${pending
        .map((migration) => migration.version)
        .join(", ")}). Refusing to apply out of order.`,
    );
  }
}

function applyPilotMigrations(
  target: ProductionDbTarget,
  pending: readonly { version: string; name: string }[],
): void {
  for (const migration of pending) {
    const path = migrationPath(migration.version, migration.name);
    const sql = readFileSync(path, "utf8");
    console.log(`Applying ${migration.version}_${migration.name}.sql`);
    // One transaction per file, mirroring how Supabase applies migrations, and
    // recording the version in the same history table the CLI uses so a later
    // `supabase db push` does not try to apply it again. The history insert is
    // in the same transaction as the migration body, so a failure leaves
    // neither the schema change nor the history row.
    runPsql(target, [
      "--single-transaction",
      "--file",
      path,
      "--command",
      `insert into supabase_migrations.schema_migrations (version, name, statements) values ('${migration.version}', '${migration.name}', array[$statements$${sql}$statements$]);`,
    ]);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const rollback = args.includes("--rollback");
  const execute = args.includes("--execute");
  if (execute) {
    if (!args.includes("--allow-production")) {
      throw new Error("--execute also requires --allow-production.");
    }
    if (!args.includes(`--confirm=${IMPORT_ID}`)) {
      throw new Error(`--execute also requires --confirm=${IMPORT_ID}.`);
    }
  }

  const databaseUrl = requiredEnv("BMH_INSTITUTE_PRODUCTION_DB_URL");

  // Phase 1: the connection gate. Nothing the database says about itself is
  // trusted until the connection string itself resolves to production.
  const resolved = resolveProductionDbTarget(databaseUrl);
  if (!resolved.ok) {
    throw new Error(`Refusing to continue. ${resolved.error}`);
  }
  const target: ProductionDbTarget = {
    projectRef: resolved.projectRef,
    host: resolved.host,
    port: resolved.port,
    user: resolved.user,
    database: resolved.database,
    canonicalUrlWithoutPassword: resolved.canonicalUrlWithoutPassword,
    password: resolved.password,
  };
  console.log(`Connection gate passed: ${target.canonicalUrlWithoutPassword}`);

  // Phase 2: in-session identity, over that same connection. This is the layer
  // that holds even if the connection string were somehow misleading.
  runSql(target, IDENTITY_SQL);
  console.log(
    `Target identity confirmed: system_identifier ${INSTITUTE_PRODUCTION_SYSTEM_IDENTIFIER}, project ${target.projectRef}.`,
  );

  if (rollback) {
    if (!execute) {
      const remaining = scalar(
        target,
        `select count(*) from public.content_blocks where id in (${BLOCK_ID_LIST});`,
      );
      console.log(
        `Dry run complete. ${remaining} of 3 pilot blocks are currently live. Nothing was written. Re-run with --rollback --execute --allow-production --confirm=${IMPORT_ID} to roll back.`,
      );
      return;
    }
    runSql(target, ROLLBACK_SQL);
    runSql(target, ROLLBACK_POSTFLIGHT_SQL);
    console.log(
      "Rollback complete and verified: 1 rollback receipt recorded and 0 pilot blocks remain.",
    );
    return;
  }

  // Phase 3: preflight.
  runSql(target, PREFLIGHT_SQL);
  console.log("Preflight passed: release pin, catalog hash pin, and one-shot check all match.");

  // Phase 4: the real plan, from remote history.
  const { pending, alreadyApplied } = planPilotMigrations(target);
  if (alreadyApplied.length > 0) {
    console.log(`Already applied remotely: ${alreadyApplied.join(", ")}`);
  }
  if (pending.length === 0) {
    throw new Error(
      "All three pilot migrations are already recorded in remote history, but the preflight found no pilot receipt. Investigate before doing anything else.",
    );
  }
  assertPendingIsContiguousTail(pending);
  console.log(
    `Plan: apply exactly ${pending.length} migration(s), in order: ${pending
      .map((migration) => migration.version)
      .join(", ")}. No other local migration is applied by this command.`,
  );

  if (!execute) {
    console.log(
      `Dry run complete. Nothing was written. Re-run with --execute --allow-production --confirm=${IMPORT_ID} to apply.`,
    );
    return;
  }

  applyPilotMigrations(target, pending);

  // Phase 5: postflight. A green apply is not evidence.
  runSql(target, APPLY_POSTFLIGHT_SQL);
  console.log("Postflight passed: 1 evidence receipt and exactly 3 required role_play blocks.");
}

// Only run when invoked as a command. Importing this module (the unit tests
// import PILOT_MIGRATIONS, assertPendingIsContiguousTail and scrub) must never
// start talking to a database or exit the process.
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The connection string is read here only in order to scrub it. Gate
    // refusals are already written to be safe, but a psql or filesystem error
    // is not.
    console.error(scrub(message, [process.env.BMH_INSTITUTE_PRODUCTION_DB_URL ?? ""]));
    process.exit(1);
  }
}
