#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dbUrl = process.env.TEST_SUPABASE_DB_URL;
if (!dbUrl) throw new Error("TEST_SUPABASE_DB_URL is required.");

const migrations = [
  {
    file: "20260728091000_hugo_access_provisioner.sql",
    guard: "select to_regclass('public.hugo_access_operations') is not null",
  },
  {
    file: "20260728113000_hugo_access_operation_payload_hash.sql",
    guard:
      "select to_regprocedure('public.hugo_apply_access_unhashed(uuid,text,text,jsonb,text,timestamptz,text)') is not null",
  },
  {
    file: "20260729210000_institute_role_group_lifecycle_lock.sql",
  },
  {
    file: "20260730200000_hugo_institute_lifecycle_contract.sql",
  },
  {
    file: "20260730210000_hugo_institute_lifecycle_contract_forward.sql",
  },
];

const psql = (args) =>
  execFileSync("psql", [dbUrl, "--set", "ON_ERROR_STOP=1", ...args], {
    env: { ...process.env, PGSSLMODE: "require" },
    stdio: "inherit",
  });

for (const { file, guard } of migrations) {
  const path = resolve(root, "supabase/migrations", file);
  if (!existsSync(path)) throw new Error(`Missing lifecycle migration: ${file}`);
  if (guard) {
    const present = execFileSync("psql", [dbUrl, "--tuples-only", "--no-align", "--command", guard], {
      env: { ...process.env, PGSSLMODE: "require" },
      encoding: "utf8",
    }).trim();
    if (present === "t") continue;
  }
  psql(["--file", path]);
}
