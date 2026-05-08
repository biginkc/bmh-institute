// Phase 3 database integration coverage. These tests run only when the
// TEST_SUPABASE_* env vars are present and use throwaway auth users/data.
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(SUPABASE_URL && ANON && SERVICE_ROLE);

const admin =
  SUPABASE_URL && SERVICE_ROLE
    ? createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

function testEmail(label: string): string {
  return `phase-3-${label}-${randomBytes(8).toString("hex")}@bmh.invalid`;
}

async function waitForProfile(userId: string): Promise<void> {
  if (!admin) return;
  for (let i = 0; i < 20; i += 1) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (data) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Profile was not created for ${userId}`);
}

async function createConfirmedUser(label: string): Promise<{
  id: string;
  email: string;
  password: string;
}> {
  if (!admin) throw new Error("Admin client unavailable.");

  const email = testEmail(label);
  const password = `${randomBytes(16).toString("base64url")}!Aa1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw error ?? new Error("Failed to create test user.");
  }
  await waitForProfile(data.user.id);
  return { id: data.user.id, email, password };
}

async function createOwnerSession(): Promise<{
  userId: string;
  client: SupabaseClient;
}> {
  if (!admin || !SUPABASE_URL || !ANON) {
    throw new Error("Integration env missing.");
  }

  const owner = await createConfirmedUser("owner");
  const { error: profileError } = await admin
    .from("profiles")
    .update({ system_role: "owner", status: "active" })
    .eq("id", owner.id);
  if (profileError) throw profileError;

  const client = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email: owner.email,
    password: owner.password,
  });
  if (signInError) throw signInError;

  return { userId: owner.id, client };
}

describe.skipIf(!envPresent)("Phase 3 data integrity integration", () => {
  it(
    "preserves existing role groups when a rewrite insert fails",
    { timeout: 30_000 },
    async () => {
      if (!admin) throw new Error("Admin client unavailable.");

      const owner = await createOwnerSession();
      const target = await createConfirmedUser("target");
      let roleGroupId: string | null = null;

      try {
        const { data: roleGroup, error: roleGroupError } = await admin
          .from("role_groups")
          .insert({
            name: `Phase 3 ${randomBytes(8).toString("hex")}`,
          })
          .select("id")
          .single();
        if (roleGroupError || !roleGroup) {
          throw roleGroupError ?? new Error("Failed to create role group.");
        }
        roleGroupId = roleGroup.id as string;

        const { error: existingError } = await admin
          .from("user_role_groups")
          .insert({
            user_id: target.id,
            role_group_id: roleGroupId,
          });
        if (existingError) throw existingError;

        const { error: rewriteError } = await owner.client.rpc(
          "fn_set_user_role_groups",
          {
            p_user_id: target.id,
            p_role_group_ids: [
              "00000000-0000-0000-0000-000000000001",
            ],
          },
        );
        expect(rewriteError).not.toBeNull();

        const { data: remaining, error: remainingError } = await admin
          .from("user_role_groups")
          .select("role_group_id")
          .eq("user_id", target.id);
        if (remainingError) throw remainingError;

        expect((remaining ?? []).map((row) => row.role_group_id)).toEqual([
          roleGroupId,
        ]);
      } finally {
        await admin.auth.admin.deleteUser(target.id).catch(() => {});
        await admin.auth.admin.deleteUser(owner.userId).catch(() => {});
        if (roleGroupId) {
          await admin.from("role_groups").delete().eq("id", roleGroupId);
        }
      }
    },
  );

  it(
    "moves modules without writing negative sort orders",
    { timeout: 30_000 },
    async () => {
      if (!admin) throw new Error("Admin client unavailable.");

      const owner = await createOwnerSession();
      let courseId: string | null = null;

      try {
        const { data: course, error: courseError } = await admin
          .from("courses")
          .insert({
            title: `Phase 3 course ${randomBytes(8).toString("hex")}`,
          })
          .select("id")
          .single();
        if (courseError || !course) {
          throw courseError ?? new Error("Failed to create course.");
        }
        courseId = course.id as string;

        const { data: modules, error: modulesError } = await admin
          .from("modules")
          .insert([
            { course_id: courseId, title: "One", sort_order: 0 },
            { course_id: courseId, title: "Two", sort_order: 1 },
            { course_id: courseId, title: "Three", sort_order: 2 },
          ])
          .select("id, sort_order")
          .order("sort_order");
        if (modulesError || !modules) {
          throw modulesError ?? new Error("Failed to create modules.");
        }

        const { error: moveError } = await owner.client.rpc("fn_move_module", {
          p_module_id: modules[1].id,
          p_course_id: courseId,
          p_direction: "down",
        });
        expect(moveError).toBeNull();

        const { error: missingError } = await owner.client.rpc(
          "fn_move_module",
          {
            p_module_id: "00000000-0000-0000-0000-000000000001",
            p_course_id: courseId,
            p_direction: "up",
          },
        );
        expect(missingError).not.toBeNull();

        const { data: after, error: afterError } = await admin
          .from("modules")
          .select("sort_order")
          .eq("course_id", courseId);
        if (afterError) throw afterError;

        expect((after ?? []).every((row) => row.sort_order >= 0)).toBe(true);
      } finally {
        await admin.auth.admin.deleteUser(owner.userId).catch(() => {});
        if (courseId) {
          await admin.from("courses").delete().eq("id", courseId);
        }
      }
    },
  );

  it(
    "reserves distinct certificate numbers under concurrent calls",
    { timeout: 30_000 },
    async () => {
      if (!admin) throw new Error("Admin client unavailable.");

      const prefix = `TST${randomBytes(4).toString("hex").toUpperCase()}`;

      try {
        const results = await Promise.all(
          Array.from({ length: 20 }, () =>
            admin.rpc("fn_next_certificate_number", { p_prefix: prefix }),
          ),
        );

        const errors = results.map((result) => result.error).filter(Boolean);
        expect(errors).toEqual([]);

        const numbers = results.map((result) => result.data as string);
        expect(new Set(numbers).size).toBe(numbers.length);
      } finally {
        await admin
          .from("certificate_number_counters")
          .delete()
          .eq("prefix", prefix);
      }
    },
  );
});

