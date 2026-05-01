// HARDEN-04: integration regression for the answer_options isolation
// boundary. Asserts the REVOKE on public.answer_options and the GRANT on
// public.answer_options_public are in effect against the live Supabase
// project. Reuses the throwaway-user pattern established in
// .../[userId]/edit/actions.integration.test.ts (HARDEN-03).
//
// These tests run against the PRODUCTION Supabase project and are READ-ONLY
// except for throwaway user creation/deletion via the service-role admin API.
// Run with: npm run test:integration
import { describe, expect, it } from "vitest";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON || !SERVICE_ROLE) {
  throw new Error(
    "Integration test requires TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test.local",
  );
}

const admin = createSbClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function withThrowawayLearner<T>(
  fn: (learner: ReturnType<typeof createSbClient>, userId: string) => Promise<T>,
): Promise<T> {
  const email = `harden-04-${randomBytes(8).toString("hex")}@bmh.invalid`;
  const password = `${randomBytes(16).toString("base64url")}!Aa1`;
  let userId: string | null = null;
  try {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createErr || !created.user) throw createErr ?? new Error("create failed");
    userId = created.user.id;

    // Brief pause to let auth propagate.
    await new Promise((r) => setTimeout(r, 250));

    const learner = createSbClient(SUPABASE_URL!, ANON!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInErr } = await learner.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) throw signInErr;

    return await fn(learner, userId);
  } finally {
    if (userId) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
  }
}

describe("answer_options isolation (HARDEN-04)", () => {
  it(
    "denies a learner anon-key SELECT on public.answer_options",
    { timeout: 30_000 },
    async () => {
      await withThrowawayLearner(async (learner) => {
        const { data, error } = await learner
          .from("answer_options")
          .select("*")
          .limit(1);

        // Either an explicit error or an empty data array is acceptable.
        // The contract is: the learner cannot read is_correct.
        const denied = error !== null || (data ?? []).length === 0;
        expect(denied).toBe(true);

        // Stronger assertion: if data did come back, it must NOT contain is_correct.
        for (const row of data ?? []) {
          expect(
            Object.keys(row as Record<string, unknown>),
          ).not.toContain("is_correct");
        }
      });
    },
  );

  it(
    "allows a learner anon-key SELECT on public.answer_options_public and returns no is_correct field",
    { timeout: 30_000 },
    async () => {
      // Find a question id with at least one answer option via service role.
      const { data: anyOption } = await admin
        .from("answer_options")
        .select("question_id")
        .limit(1)
        .maybeSingle();

      if (!anyOption) {
        // No data in the project; skip the row-shape assertion. The
        // GRANT contract still holds (no error on the SELECT).
        await withThrowawayLearner(async (learner) => {
          const { error } = await learner
            .from("answer_options_public")
            .select("*")
            .limit(1);
          expect(error).toBeNull();
        });
        return;
      }

      await withThrowawayLearner(async (learner) => {
        const { data, error } = await learner
          .from("answer_options_public")
          .select("*")
          .eq("question_id", anyOption.question_id as string)
          .limit(1);
        expect(error).toBeNull();
        if ((data ?? []).length > 0) {
          const row = (data as Array<Record<string, unknown>>)[0];
          // Shape contract: exactly the four pinned columns, no is_correct.
          expect(Object.keys(row).sort()).toEqual([
            "id",
            "option_text",
            "question_id",
            "sort_order",
          ]);
          expect(row).not.toHaveProperty("is_correct");
        }
      });
    },
  );

  it(
    "preserves admin SELECT on public.answer_options including is_correct",
    { timeout: 30_000 },
    async () => {
      const { data, error } = await admin
        .from("answer_options")
        .select("id, is_correct")
        .limit(1);
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    },
  );
});
