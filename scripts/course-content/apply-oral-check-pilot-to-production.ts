// Executable hard gate for the Andrea Oral Check pilot deployment.
//
// Round-6 Codex review of PR #130, finding 4: the runbook's production-target
// preflight ran `supabase status`, which reports the LOCAL Supabase stack and
// cannot prove which remote project a deployment connection points at. The
// reviewer's recommendation was an executable hard gate that resolves the
// linked project URL, exits unless it is dhvfsyteqsxagokoerrx, and uses that
// same verified connection for preflight, apply, and postflight.
//
// That last part is the reason this is a script rather than a longer runbook
// snippet. A human pasting SQL into one session and then running
// `supabase db push` in another has a real window where the thing verified and
// the thing written are not the same connection. Here there is exactly one
// resolved target value, and every phase is handed that same value.
//
// Dry run by default, matching the importer culture documented at the top of
// docs/course-production/import-runbook.md. A dry run performs the connection
// gate, the full preflight, and a read-only postflight report, then stops
// without writing anything.
//
// Usage:
//   BMH_INSTITUTE_PRODUCTION_DB_URL=... npm run course:oral-check:apply
//   BMH_INSTITUTE_PRODUCTION_DB_URL=... npm run course:oral-check:apply -- \
//     --execute --allow-production --confirm=bmh-employee-training-v1

import { execFileSync } from "node:child_process";

import {
  INSTITUTE_PRODUCTION_PROJECT_REF,
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

// The exact fail-closed assertions documented in the runbook's step 3. Kept as
// one statement so a partial pass is impossible.
const PREFLIGHT_SQL = `
do $$
declare
  v_live_catalog_sha256 text;
begin
  if current_user <> 'postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}' then
    raise exception 'target preflight failed: connected as %, expected postgres.${INSTITUTE_PRODUCTION_PROJECT_REF}', current_user;
  end if;
  if not exists (
    select 1 from public.content_import_release_records
    where import_id = '${IMPORT_ID}'
      and program_id = '${EXPECTED_PROGRAM_ID}'
      and manifest_sha256 = '${EXPECTED_MANIFEST_SHA256}'
  ) then
    raise exception 'target preflight failed: no ${IMPORT_ID} release record matching the exact production program and manifest pin. Wrong target, incomplete restore, or the catalog was never released.';
  end if;
  v_live_catalog_sha256 := public.fn_course_import_catalog_sha256('${IMPORT_ID}');
  if v_live_catalog_sha256 <> '${EXPECTED_CATALOG_SHA256}' then
    raise exception 'target preflight failed: live catalog hashes to %, the migration is pinned to ${EXPECTED_CATALOG_SHA256}. Either this is not the production catalog, or production has drifted since the pin was taken and the migration must be re-authored.', v_live_catalog_sha256;
  end if;
  if exists (
    select 1 from public.content_import_oral_check_pilot_role_play_records
    where import_id = '${IMPORT_ID}'
  ) then
    raise exception 'target preflight failed: the pilot insertion receipt already exists on this target. This is a one-shot operation and has already been performed.';
  end if;
  raise notice 'preflight ok';
end;
$$;
`;

// A green migration run is explicitly not sufficient evidence for this change.
const POSTFLIGHT_SQL = `
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
  where id in (${EXPECTED_BLOCK_IDS.map((id) => `'${id}'`).join(", ")})
    and block_type = 'role_play'
    and is_required_for_completion;
  if v_blocks <> 3 then
    raise exception 'postflight failed: expected exactly 3 required role_play blocks, found %', v_blocks;
  end if;
  raise notice 'postflight ok';
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

// psql is driven through PG* environment variables rather than a URL argument,
// so the password never appears in this machine's process list.
function psqlEnv(target: ProductionDbTarget, databaseUrl: string): NodeJS.ProcessEnv {
  const parsed = new URL(databaseUrl);
  return {
    ...process.env,
    PGHOST: target.host,
    PGPORT: parsed.port || "5432",
    PGUSER: target.user,
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: target.database,
    PGSSLMODE: "require",
  };
}

function runSql(target: ProductionDbTarget, databaseUrl: string, sql: string): string {
  return execFileSync("psql", ["--set", "ON_ERROR_STOP=1", "--command", sql], {
    env: psqlEnv(target, databaseUrl),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function main(): void {
  const args = process.argv.slice(2);
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

  // Phase 1: the connection gate. Nothing this database says about itself is
  // trusted until the connection itself proves which project it is.
  const resolved = resolveProductionDbTarget(databaseUrl);
  if (!resolved.ok) {
    throw new Error(`Refusing to continue. ${resolved.error}`);
  }
  const target: ProductionDbTarget = {
    projectRef: resolved.projectRef,
    host: resolved.host,
    user: resolved.user,
    database: resolved.database,
  };
  console.log(`Connection gate passed: project ${target.projectRef} on ${target.host}.`);

  // Phase 2: preflight, over that same verified connection.
  runSql(target, databaseUrl, PREFLIGHT_SQL);
  console.log("Preflight passed: release pin, catalog hash pin, and one-shot check all match.");

  if (!execute) {
    console.log(
      `Dry run complete. Nothing was written. Re-run with --execute --allow-production --confirm=${IMPORT_ID} to apply.`,
    );
    return;
  }

  // Phase 3: apply, over that same verified connection. supabase db push takes
  // the URL as an argument, which is the mechanism .github/workflows/db-migrate-test.yml
  // already uses; the value handed to it is the one the gate resolved, not a
  // separately supplied string.
  execFileSync(
    "supabase",
    ["db", "push", "--include-all", "--db-url", databaseUrl, "--yes"],
    { stdio: "inherit" },
  );

  // Phase 4: postflight, over that same verified connection. A green push is
  // not evidence; the receipt and the 3 rows are.
  runSql(target, databaseUrl, POSTFLIGHT_SQL);
  console.log("Postflight passed: 1 evidence receipt and exactly 3 required role_play blocks.");
}

try {
  main();
} catch (error) {
  // Never echo the connection string. Refusals from the gate are already
  // written to be safe to print.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
