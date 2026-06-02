// HARDEN-03: integration regression for deleteUser against the real
// Supabase project. First integration test in the codebase. Establishes
// the throwaway-user pattern: every test creates and destroys its own
// auth.users row and never mutates seed data. Per AGENTS.md and STATE.md
// "no writes in integration tests without explicit confirmation of safe
// harness setup": this test's safe shape is documented in
// .planning/phases/01-auth-and-access-hardening/01-3-user-deletion-PLAN.md.
//
// Gated by describe.skipIf — runs when TEST_SUPABASE_URL,
// TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY are populated in
// .env.test.local; reports `skipped` otherwise.
import { describe, expect, it, vi } from "vitest";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const serverClientMock = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => ({
    id: "00000000-0000-0000-0000-000000000000",
    email: "harden-03-test@bmh.invalid",
    system_role: "owner",
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientMock.client) {
      throw new Error("Integration server client mock was not initialized.");
    }
    return serverClientMock.client;
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { deleteUser } from "./actions";

// Integration config injects TEST_SUPABASE_* vars from .env.test.local
const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(SUPABASE_URL && ANON && SERVICE_ROLE);

// Build admin client once at module scope (only evaluated when tests run).
// If env vars are missing the describe.skipIf guard below prevents execution.
const admin =
  SUPABASE_URL && SERVICE_ROLE
    ? createSbClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

describe.skipIf(!envPresent)(
  "deleteUser integration (HARDEN-03)",
  () => {
    it(
      "removes the auth.users row so the deleted user cannot re-authenticate",
      { timeout: 30_000 },
      async () => {
        if (!admin || !SUPABASE_URL || !ANON || !SERVICE_ROLE) {
          throw new Error(
            "Integration test requires TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test.local",
          );
        }
        serverClientMock.client = admin;

        const email = `harden-03-${randomBytes(8).toString("hex")}@bmh.invalid`;
        const password = `${randomBytes(16).toString("base64url")}!Aa1`;
        let userId: string | null = null;

        try {
          const { data: created, error: createErr } =
            await admin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
            });
          if (createErr || !created.user) {
            throw createErr ?? new Error("Failed to create test user");
          }
          userId = created.user.id;

          // Allow time for the handle_new_user trigger to populate profiles.
          await new Promise((r) => setTimeout(r, 250));

          const result = await deleteUser(userId);
          expect(result).toEqual({ ok: true });

          const anon = createSbClient(SUPABASE_URL, ANON, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          const { data: signInData, error: signInErr } =
            await anon.auth.signInWithPassword({ email, password });
          // Re-auth must fail after permanent delete (HARDEN-03 AC).
          expect(signInErr).not.toBeNull();
          expect(signInData.user).toBeNull();

          const { data: profileRow } = await admin
            .from("profiles")
            .select("id")
            .eq("id", userId)
            .maybeSingle();
          expect(profileRow).toBeNull();

          userId = null;
        } finally {
          if (userId) {
            // Cleanup orphan if the test threw before deleteUser completed.
            await admin.auth.admin.deleteUser(userId).catch(() => {});
          }
        }
      },
    );

    it(
      "cascades user-scoped data when the user is deleted",
      { timeout: 30_000 },
      async () => {
        if (!admin || !SUPABASE_URL || !ANON || !SERVICE_ROLE) {
          throw new Error(
            "Integration test requires TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test.local",
          );
        }
        serverClientMock.client = admin;

        const email = `harden-03-${randomBytes(8).toString("hex")}@bmh.invalid`;
        const password = `${randomBytes(16).toString("base64url")}!Aa1`;
        let userId: string | null = null;

        try {
          const { data: created, error: createErr } =
            await admin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
            });
          if (createErr || !created.user) {
            throw createErr ?? new Error("create failed");
          }
          userId = created.user.id;

          // Allow time for the handle_new_user trigger to populate profiles.
          await new Promise((r) => setTimeout(r, 250));

          // Insert a user_role_groups row if any role_groups exist.
          // This pins the D-05 cascade contract.
          const { data: anyGroup } = await admin
            .from("role_groups")
            .select("id")
            .limit(1)
            .maybeSingle();

          if (anyGroup) {
            await admin.from("user_role_groups").insert({
              user_id: userId,
              role_group_id: anyGroup.id,
            });
          }

          const result = await deleteUser(userId);
          expect(result).toEqual({ ok: true });

          // user_role_groups should be empty for this user after cascade.
          const { data: rolesAfter } = await admin
            .from("user_role_groups")
            .select("user_id")
            .eq("user_id", userId);
          expect(rolesAfter ?? []).toHaveLength(0);

          // profiles row should be gone.
          const { data: profileAfter } = await admin
            .from("profiles")
            .select("id")
            .eq("id", userId)
            .maybeSingle();
          expect(profileAfter).toBeNull();

          userId = null;
        } finally {
          if (userId) {
            await admin.auth.admin.deleteUser(userId).catch(() => {});
          }
        }
      },
    );
  },
);
