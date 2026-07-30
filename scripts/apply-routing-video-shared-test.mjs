#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dbUrl = process.env.TEST_SUPABASE_DB_URL;
if (!dbUrl) throw new Error("TEST_SUPABASE_DB_URL is required.");

const migrations = [
  "20260730120000_video_resume_checkpoint.sql",
  "20260730130000_drop_legacy_video_checkpoint_overload.sql",
];

for (const file of migrations) {
  const path = resolve(root, "supabase/migrations", file);
  if (!existsSync(path)) throw new Error(`Missing routing/video migration: ${file}`);
  execFileSync("psql", [dbUrl, "--set", "ON_ERROR_STOP=1", "--file", path], {
    env: { ...process.env, PGSSLMODE: "require" },
    stdio: "inherit",
  });
}
