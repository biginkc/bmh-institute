---
phase: 01-auth-and-access-hardening
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(dashboard)/admin/users/[userId]/edit/actions.ts
  - src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts
  - src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts
  - src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx
autonomous: true
requirements:
  - HARDEN-03
must_haves:
  truths:
    - deleteUser invokes admin.auth.admin.deleteUser(userId) so the auth.users row is removed (D-04)
    - A deleted user cannot re-authenticate with their original credentials (D-04)
    - Cascade FKs already in 001_initial_schema.sql tear down user_role_groups, user_lesson_completions, user_quiz_attempts, assignment_submissions, certificates, and program_certificates when the auth.users row is deleted (D-05; no new migration)
    - The self-delete guard remains (admins cannot delete themselves)
    - The last-owner guard prevents deletion of the only remaining owner (D-06)
    - The user-edit-form confirm copy and toast message reflect "delete" rather than "suspend" (D-04)
    - Suspend remains available as a separate reversible action via the existing edit form's status toggle (D-04)
  artifacts:
    - path: src/app/(dashboard)/admin/users/[userId]/edit/actions.ts
      provides: deleteUser uses createAdminClient and calls auth.admin.deleteUser, with last-owner guard
      contains: "auth.admin.deleteUser"
    - path: src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts
      provides: Vitest unit asserting deleteUser calls auth.admin.deleteUser, blocks self-delete, blocks last-owner delete
    - path: src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts
      provides: Vitest integration asserting end-to-end real-Supabase delete, cascade tear-down across user-scoped tables, and re-auth refusal
    - path: src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx
      provides: Confirm dialog copy + toast message updated to "delete"
  key_links:
    - from: src/app/(dashboard)/admin/users/[userId]/edit/actions.ts
      to: src/lib/supabase/admin.ts
      via: createAdminClient().auth.admin.deleteUser(userId)
      pattern: "auth.admin.deleteUser"
    - from: auth.users (Supabase)
      to: public.profiles
      via: profiles.id references auth.users(id) on delete cascade (migration 001 line 17)
      pattern: "on delete cascade"
    - from: public.profiles
      to: user_role_groups, user_lesson_completions, user_quiz_attempts, assignment_submissions, user_block_progress, user_course_resume, certificates, program_certificates
      via: each table's user_id references public.profiles(id) on delete cascade (migration 001 lines 40, 216, 229, 237, 245, 258, 268, 278)
      pattern: "on delete cascade"
---

<objective>
Close HARDEN-03: `deleteUser` removes the `auth.users` record (not just the profile) so a deleted user cannot re-authenticate, and the cascade tear-down across user-scoped tables is explicitly tested.

Purpose: The current `deleteUser` at `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` only sets `profiles.status = 'suspended'`. Per CONCERNS.md the `auth.users` row remains and the user can still sign in. Per D-04 "Delete" becomes a true permanent delete via `admin.auth.admin.deleteUser(userId)`. Per D-05 no new cascade migration is required because every user-scoped FK to `profiles.id` already declares `on delete cascade` in `001_initial_schema.sql`, and `profiles.id` itself cascades from `auth.users(id) on delete cascade`. Per D-06 the last `owner` cannot be deleted.

Output:
- `deleteUser` is rewritten to fetch the target's `system_role`, run the last-owner guard when needed, acquire the admin client, call `admin.auth.admin.deleteUser(userId)`, and `revalidatePath("/admin/users")`.
- A Vitest unit covers the three guard paths (self, last-owner, normal) and asserts the admin call is made.
- A Vitest integration test against the real Supabase project creates a user, exercises a delete, and asserts the user cannot sign in afterwards AND that the user-scoped tables no longer hold rows for that user (cascade contract).
- The user-edit-form confirm copy is updated from "Suspend this user?" / "auth account itself stays in Supabase" to a delete-shaped copy.
- Failing-tests commit lands first; implementation commit makes them pass.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/phases/01-auth-and-access-hardening/01-CONTEXT.md
@.planning/phases/01-auth-and-access-hardening/01-PATTERNS.md
@.planning/codebase/CONCERNS.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/STRUCTURE.md
@.planning/codebase/TESTING.md
@AGENTS.md
@src/app/(dashboard)/admin/users/[userId]/edit/actions.ts
@src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx
@src/app/(dashboard)/admin/users/actions.ts
@src/lib/supabase/admin.ts
@supabase/migrations/001_initial_schema.sql
@vitest.integration.config.ts

<interfaces>
<!-- Contracts the executor needs without exploring. -->

From src/app/(dashboard)/admin/users/[userId]/edit/actions.ts (current deleteUser, lines 154-173, summarised in 01-PATTERNS.md):
```typescript
export async function deleteUser(userId: string): Promise<{
  ok: true;
} | { ok: false; error: string }> {
  const me = await requireAdmin();
  if (me.id === userId) {
    return { ok: false, error: "You can't delete yourself." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status: "suspended" })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}
```

The createAdminClient try/catch pattern (verbatim from src/app/(dashboard)/admin/users/actions.ts:36-47):
```typescript
let admin;
try {
  admin = createAdminClient();
} catch (e) {
  const message = e instanceof Error ? e.message : "Admin client unavailable.";
  return { ok: false, error: message };
}
```

From src/lib/supabase/admin.ts the call available on the admin client:
admin.auth.admin.deleteUser(userId: string) returns Promise of object with data and error fields.

Cascade contract — verified in supabase/migrations/001_initial_schema.sql:
- profiles.id uuid primary key references auth.users(id) on delete cascade (line 17)
- user_role_groups.user_id references public.profiles(id) on delete cascade (line 40)
- assignment_submissions.user_id ... on delete cascade (line 216)
- user_block_progress.user_id ... on delete cascade (line 229)
- user_lesson_completions.user_id ... on delete cascade (line 237)
- user_quiz_attempts.user_id ... on delete cascade (line 245)
- user_course_resume.user_id ... on delete cascade (line 258)
- certificates.user_id ... on delete cascade (line 268)
- program_certificates.user_id ... on delete cascade (line 278)

Deliberately NOT cascaded (preserve audit history):
- assignment_submissions.reviewed_by ... on delete set null (line 222)
- invites.invited_by ... on delete set null (line 292)
- audit_log.user_id ... on delete set null (line 300)

From .planning/codebase/TESTING.md:
- Integration tests live as `*.integration.test.ts`, run via `npm run test:integration`, hit the real Supabase project, sequential execution, 30s timeout
- Credentials loaded from `.env.test.local`
- No integration test files currently exist; this plan creates the FIRST one
- Per STATE.md "Blockers/Concerns": no writes in integration tests without explicit confirmation of safe harness setup. The harness for THIS test creates a throwaway user via `admin.auth.admin.createUser`, exercises delete, and verifies cleanup via the cascade. The user record is created and destroyed within the test — no shared/long-lived data is mutated. This is the safe shape per AGENTS.md ("integration tests run against the production Supabase project").
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Test inventory review</name>
  <files>(no files written; reviewable contract)</files>
  <read_first>
    - .planning/phases/01-auth-and-access-hardening/01-CONTEXT.md (D-04, D-05, D-06)
    - .planning/phases/01-auth-and-access-hardening/01-PATTERNS.md (section "src/app/(dashboard)/admin/users/[userId]/edit/actions.ts — HARDEN-03")
    - .planning/codebase/TESTING.md ("Integration Tests" subsection)
    - vitest.integration.config.ts (confirm the harness setup — env loading, timeout, sequential)
    - .env.example (confirm what envs the integration test will need)
    - supabase/migrations/001_initial_schema.sql lines 1-50, 200-310 (verify the cascade contract)
  </read_first>
  <action>
Enumerate the failing test inventory for HARDEN-03. Per REQUIREMENTS.md the regression must "assert that a deleted user cannot re-authenticate". This requires a real Supabase round-trip — no Vitest mock can simulate Supabase Auth. Per AGENTS.md and STATE.md the integration suite runs against the production Supabase project; the test must self-clean and not depend on long-lived seed data.

The unit suite covers the action's branch logic (self-guard, last-owner-guard, admin client failure, normal path) without hitting Supabase.

Inventory:

File A — `src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts` (Vitest unit; runs in `npm run test`)

`describe("deleteUser (HARDEN-03)")`:
1. `it("refuses to delete the acting admin themselves")` — Mock `requireAdmin` to return an admin profile whose id matches the call argument. Assert result is `{ ok: false, error: "You can't delete yourself." }` and no Supabase calls were made.

2. `it("refuses to delete the last remaining owner")` — Mock `requireAdmin` to return a different admin. Lookup returns `{ system_role: "owner" }`. Count returns `1`. Assert `{ ok: false, error: "Can't delete the last owner." }` and `auth.admin.deleteUser` was NOT called.

3. `it("allows deletion of an owner when at least one other owner remains")` — Same shape but count returns `2`. Spy returns `{ error: null }`. Assert `{ ok: true }` and the spy was called once with the target id.

4. `it("calls admin.auth.admin.deleteUser for a non-owner target")` — Lookup returns `{ system_role: "admin" }` (not owner — the count query must NOT be made). Spy returns `{ error: null }`. Assert `{ ok: true }` and spy called.

5. `it("surfaces the admin client error when env vars are missing")` — Mock `createAdminClient` to throw `new Error("Service role key missing")`. Assert `{ ok: false, error: "Service role key missing" }`.

6. `it("surfaces auth.admin.deleteUser failure")` — Spy returns `{ error: { message: "user not found" } }`. Assert `{ ok: false, error: "user not found" }`.

Six `it` cases. They cover all guard branches and the two failure surfaces.

File B — `src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts` (Vitest integration; runs in `npm run test:integration` only)

`describe("deleteUser integration (HARDEN-03)")`:

1. `it("removes the auth.users row so the deleted user cannot re-authenticate", { timeout: 30_000 })`
   - Setup (in the test body, NOT a shared `beforeEach` — keeps the test self-contained per TESTING.md "No shared fixture files"):
     - Build a service-role admin client via `createClient` from `@supabase/supabase-js` using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env.test.local`.
     - Generate a unique throwaway email: `harden-03-${randomBytes(8).toString("hex")}@bmh.invalid`.
     - Generate a strong throwaway password.
     - Call `admin.auth.admin.createUser({ email, password, email_confirm: true })`. Capture the new `userId`.
     - Wait briefly (250ms) for the `handle_new_user` trigger to populate `profiles`.
   - Action:
     - Import the production `deleteUser` action from `./actions` AND mock `requireAdmin` so it returns a fake admin profile.
     - Call `await deleteUser(userId)`.
     - Assert the result is `{ ok: true }`.
   - Verification:
     - `admin.from("profiles").select("id").eq("id", userId).maybeSingle()` returns `{ data: null }`.
     - Re-auth check: build a second client with `SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Call `anon.auth.signInWithPassword({ email, password })`. Assert `error` is non-null and `signInData.user` is null. This is the AC-mandated assertion.
   - Cleanup: try/finally — if anything threw before delete completed, attempt `admin.auth.admin.deleteUser(userId)` to remove the orphan.

2. `it("cascades user-scoped data when the user is deleted", { timeout: 30_000 })`
   - Same throwaway-user setup as test 1.
   - Insert one row into `user_role_groups` referencing the throwaway user (use the first available `role_groups.id` — if none exist in the project, skip this fixture and the test asserts only the profiles cascade).
   - Call `deleteUser(userId)`.
   - Assert `user_role_groups` returns `{ data: [] }` for `user_id = userId`.
   - Assert `profiles` returns `null` for the user id.
   - This is the D-05 cascade contract pinned as a regression.

The integration suite is the FIRST integration test in the codebase per TESTING.md. The first test file establishes the pattern for the rest of the milestone. Document this in a header comment.

Self-clean rule: every test wraps the throwaway-user lifecycle in try/finally so a thrown assertion still attempts a final delete. This prevents orphan users in the production project.

This inventory is the contract.
  </action>
  <verify>
    <automated>echo "Test inventory enumerated; awaiting reviewer ack."</automated>
  </verify>
  <acceptance_criteria>
    - Task summary lists 2 test files and 8 total `it` cases (6 unit + 2 integration)
    - Each `it` description names what it asserts
    - The integration suite's safety contract (throwaway email, try/finally cleanup, no seed-data mutation) is named explicitly
    - The first-integration-test status is called out so the reviewer knows the pattern is being established
  </acceptance_criteria>
  <done>The inventory is the single contract for the failing-tests commit.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Write failing tests and commit</name>
  <files>
    - src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts
    - src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts
  </files>
  <read_first>
    - src/app/(dashboard)/admin/users/[userId]/edit/actions.ts (the file under test — confirm `deleteUser` is exported and what its current signature is)
    - vitest.integration.config.ts (confirm env loading and `.integration.test.ts` glob)
    - .env.test.local OR .env.example (confirm `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are documented)
    - src/lib/quizzes/score.test.ts (style reference)
    - .planning/codebase/TESTING.md "Test Structure" and "Integration Tests"
  </read_first>
  <behavior>
    - Unit Test 1: self-delete blocked → `{ ok: false, error: "You can't delete yourself." }`
    - Unit Test 2: last-owner blocked → `{ ok: false, error: "Can't delete the last owner." }`
    - Unit Test 3: owner with peers → `{ ok: true }`, admin spy called
    - Unit Test 4: non-owner → `{ ok: true }`, no count query, admin spy called
    - Unit Test 5: admin client throws → error message surfaced
    - Unit Test 6: auth.admin.deleteUser fails → error message surfaced
    - Integration Test 1: real-Supabase delete + re-auth check fails
    - Integration Test 2: cascade tear-down across at least one user-scoped table
    - All eight cases fail at this commit because `deleteUser` still calls `profiles.update({ status: "suspended" })` and never invokes `auth.admin.deleteUser`
  </behavior>
  <action>
File A — `src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts`

Header:
```typescript
// HARDEN-03: regression for deleteUser. Six branches: self, last-owner,
// owner-with-peers, non-owner, admin-client-fail, auth-delete-fail.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

Module-level state and mocks:
```typescript
type Profile = { id: string; email: string; system_role: string };
let actor: Profile = { id: "admin-1", email: "a@b.com", system_role: "admin" };
let targetRow: { system_role: string } | null = null;
let ownerCount = 0;
let adminFactoryThrows: Error | null = null;
const deleteUserSpy = vi.fn(
  async (_id: string) => ({ data: null, error: null as { message: string } | null }),
);

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => actor),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        select: (
          _cols: string,
          opts?: { count?: string; head?: boolean },
        ) => {
          if (opts?.count === "exact") {
            return {
              eq: async () => ({ count: ownerCount, error: null }),
            };
          }
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: targetRow, error: null }),
            }),
          };
        },
      };
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    if (adminFactoryThrows) throw adminFactoryThrows;
    return {
      auth: { admin: { deleteUser: deleteUserSpy } },
    };
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteUser } from "./actions";
```

Six `it` cases (excerpt — the rest follow the same shape):
```typescript
describe("deleteUser (HARDEN-03)", () => {
  beforeEach(() => {
    actor = { id: "admin-1", email: "a@b.com", system_role: "admin" };
    targetRow = null;
    ownerCount = 0;
    adminFactoryThrows = null;
    deleteUserSpy.mockReset();
    deleteUserSpy.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to delete the acting admin themselves", async () => {
    const result = await deleteUser("admin-1");
    expect(result).toEqual({ ok: false, error: "You can't delete yourself." });
    expect(deleteUserSpy).not.toHaveBeenCalled();
  });

  it("refuses to delete the last remaining owner", async () => {
    targetRow = { system_role: "owner" };
    ownerCount = 1;
    const result = await deleteUser("owner-2");
    expect(result).toEqual({ ok: false, error: "Can't delete the last owner." });
    expect(deleteUserSpy).not.toHaveBeenCalled();
  });

  it("allows deletion of an owner when at least one other owner remains", async () => {
    targetRow = { system_role: "owner" };
    ownerCount = 2;
    const result = await deleteUser("owner-2");
    expect(result).toEqual({ ok: true });
    expect(deleteUserSpy).toHaveBeenCalledWith("owner-2");
  });

  it("calls admin.auth.admin.deleteUser for a non-owner target", async () => {
    targetRow = { system_role: "admin" };
    const result = await deleteUser("admin-2");
    expect(result).toEqual({ ok: true });
    expect(deleteUserSpy).toHaveBeenCalledWith("admin-2");
  });

  it("surfaces the admin client error when env vars are missing", async () => {
    targetRow = { system_role: "admin" };
    adminFactoryThrows = new Error("Service role key missing");
    const result = await deleteUser("admin-2");
    expect(result).toEqual({ ok: false, error: "Service role key missing" });
  });

  it("surfaces auth.admin.deleteUser failure", async () => {
    targetRow = { system_role: "admin" };
    deleteUserSpy.mockResolvedValueOnce({
      data: null,
      error: { message: "user not found" },
    });
    const result = await deleteUser("admin-2");
    expect(result).toEqual({ ok: false, error: "user not found" });
  });
});
```

File B — `src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts`

Header (note the safe-harness comment per STATE.md):
```typescript
// HARDEN-03: integration regression for deleteUser against the real
// Supabase project. First integration test in the codebase. Establishes
// the throwaway-user pattern: every test creates and destroys its own
// auth.users row and never mutates seed data. Per AGENTS.md and STATE.md
// "no writes in integration tests without explicit confirmation of safe
// harness setup": this test's safe shape is documented in
// .planning/phases/01-auth-and-access-hardening/01-3-user-deletion-PLAN.md.
import { describe, expect, it, vi } from "vitest";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => ({
    id: "00000000-0000-0000-0000-000000000000",
    email: "harden-03-test@bmh.invalid",
    system_role: "owner",
  })),
}));

import { deleteUser } from "./actions";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON || !SERVICE_ROLE) {
  throw new Error(
    "Integration test requires SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.test.local",
  );
}

const admin = createSbClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

Test 1 (re-auth check):
```typescript
describe("deleteUser integration (HARDEN-03)", () => {
  it(
    "removes the auth.users row so the deleted user cannot re-authenticate",
    { timeout: 30_000 },
    async () => {
      const email = `harden-03-${randomBytes(8).toString("hex")}@bmh.invalid`;
      const password = `${randomBytes(16).toString("base64url")}!Aa1`;
      let userId: string | null = null;

      try {
        const { data: created, error: createErr } =
          await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (createErr || !created.user) {
          throw createErr ?? new Error("Failed to create test user");
        }
        userId = created.user.id;

        await new Promise((r) => setTimeout(r, 250));

        const result = await deleteUser(userId);
        expect(result).toEqual({ ok: true });

        const anon = createSbClient(SUPABASE_URL!, ANON!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: signInData, error: signInErr } =
          await anon.auth.signInWithPassword({ email, password });
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
          await admin.auth.admin.deleteUser(userId).catch(() => {});
        }
      }
    },
  );
});
```

Test 2 (cascade contract):
```typescript
it(
  "cascades user-scoped data when the user is deleted",
  { timeout: 30_000 },
  async () => {
    const email = `harden-03-${randomBytes(8).toString("hex")}@bmh.invalid`;
    const password = `${randomBytes(16).toString("base64url")}!Aa1`;
    let userId: string | null = null;

    try {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (createErr || !created.user) throw createErr ?? new Error("create failed");
      userId = created.user.id;
      await new Promise((r) => setTimeout(r, 250));

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

      const { data: rolesAfter } = await admin
        .from("user_role_groups")
        .select("user_id")
        .eq("user_id", userId);
      expect(rolesAfter ?? []).toHaveLength(0);

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
```

Both tests fail at this commit because the production `deleteUser` still calls `profiles.update({ status: "suspended" })` rather than `auth.admin.deleteUser`. Specifically:
- Unit cases 3, 4, 5, 6 fail (the `deleteUserSpy` is never called; admin client never acquired)
- Unit case 2 fails (the production action does NOT have a last-owner guard, so it returns `{ ok: true }` after the suspend update)
- Unit case 1 passes (the self-guard already exists)
- Integration cases fail (re-auth still works since `auth.users` is intact)

Verify the red state:
- `npm run test -- src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions`
- `npm run test:integration -- src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions.integration.test.ts` (requires `.env.test.local`; if env is missing the test errors at module load — also acceptable as red state, surface in commit body)

Commit:
```
test(01-auth): HARDEN-03 failing regression for permanent user deletion

Six unit cases plus two integration cases against the real Supabase
project. First integration test in the codebase; establishes the
throwaway-user safe-write pattern documented in
.planning/phases/01-auth-and-access-hardening/01-3-user-deletion-PLAN.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run test -- src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions 2>&1 | tee /tmp/harden-03-red-unit.log; tail -30 /tmp/harden-03-red-unit.log</automated>
  </verify>
  <acceptance_criteria>
    - Both test files exist at the paths in `<files>`
    - `npm run test -- src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions` shows the unit suite with at least 4 failing `it` cases (cases 2-6 above)
    - The commit message starts with `test(01-auth):`
    - `git log -1 --name-only` shows ONLY the two new test files
    - The integration test file references `randomBytes` and `bmh.invalid` for self-clean throwaway data
  </acceptance_criteria>
  <done>Failing tests committed. Integration test framework established for the rest of the milestone.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Implement true delete + last-owner guard, update UI copy, commit</name>
  <files>
    - src/app/(dashboard)/admin/users/[userId]/edit/actions.ts
    - src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx
  </files>
  <read_first>
    - src/app/(dashboard)/admin/users/[userId]/edit/actions.ts (the existing deleteUser body — replace lines 154-173 only; leave the rest of the file alone)
    - src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx (the existing confirm-dialog copy at ~lines 90-92 per CONTEXT.md `## Specifics`)
    - src/app/(dashboard)/admin/users/actions.ts (lines 36-47 — verbatim createAdminClient try/catch analog)
    - .planning/phases/01-auth-and-access-hardening/01-PATTERNS.md ("src/app/(dashboard)/admin/users/[userId]/edit/actions.ts — HARDEN-03" — verbatim implementation snippet)
  </read_first>
  <action>
1. `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` — rewrite `deleteUser`.

Add the import for `createAdminClient` if not already present at the top of the file (group with other `@/lib/*` imports per CONVENTIONS.md):
```typescript
import { createAdminClient } from "@/lib/supabase/admin";
```

Replace the existing `deleteUser` body (lines 154-173) verbatim with:
```typescript
export async function deleteUser(userId: string): Promise<{
  ok: true;
} | { ok: false; error: string }> {
  const me = await requireAdmin();
  if (me.id === userId) {
    return { ok: false, error: "You can't delete yourself." };
  }

  const supabase = await createClient();

  // HARDEN-03 / D-06: refuse to delete the last remaining owner.
  const { data: target } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", userId)
    .maybeSingle();
  if (target?.system_role === "owner") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("system_role", "owner");
    if ((count ?? 0) <= 1) {
      return { ok: false, error: "Can't delete the last owner." };
    }
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Admin client unavailable.";
    return { ok: false, error: message };
  }

  // HARDEN-03 / D-04: removing auth.users cascades to public.profiles via
  // migration 001 (profiles.id references auth.users(id) on delete cascade).
  // All user-scoped tables cascade off profiles.id per the FKs declared in
  // migration 001 lines 40, 216, 229, 237, 245, 258, 268, 278. No new
  // migration is required (D-05).
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) return { ok: false, error: authErr.message };

  revalidatePath("/admin/users");
  return { ok: true };
}
```

Do NOT touch any other function in this file (`saveUserSettings`, etc.). They are out of scope.

2. `src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx` — update confirm copy.

The existing confirm dialog (per CONTEXT.md `## Specifics` and PATTERNS.md "UI copy update reminder") says something like "Suspend this user? ... auth account itself stays in Supabase". Read the file first to find the exact text. Replace the relevant strings with delete-shaped copy. Suggested values (within Claude's discretion per CONTEXT.md):

- Confirm dialog message: `Permanently delete this user? They will be removed from auth and all their progress, certificates, and role assignments will be deleted. This cannot be undone.`
- Toast on success: change any `User suspended.` to `User deleted.`

Do NOT touch the suspend toggle UI elsewhere in the same form — D-04 keeps suspend available as a separate reversible action via the existing `status` toggle. Only the delete button's confirm copy and toast change.

After both changes:
- `npm run test -- src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions` → all 6 unit cases pass
- `npm run verify` → green
- `npm run test:integration -- src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions.integration.test.ts` → both integration cases pass (requires `.env.test.local`)

If the integration test cannot be run in the executor's environment (missing env vars), surface clearly in the commit body. The unit suite passing is sufficient for the commit; the integration suite's status is reported alongside.

Commit:
```
feat(01-auth): HARDEN-03 permanently delete users via admin auth client

deleteUser now calls admin.auth.admin.deleteUser(userId) so the auth.users
row is removed and the user cannot re-authenticate. The cascade FKs already
declared in migration 001 tear down user-scoped data; no new migration
required (D-05). Adds a last-owner guard (D-06) and updates the user-edit
form confirm copy from "Suspend" to "Delete" (D-04).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run verify 2>&1 | tail -40 && grep -c "auth.admin.deleteUser" src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions.ts && grep -c "Can't delete the last owner" src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep "auth.admin.deleteUser" src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` returns a match
    - `grep "Can't delete the last owner" src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` returns a match
    - `grep "createAdminClient" src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` returns a match
    - `grep -c "User suspended" src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx` returns 0 (the old toast text is gone)
    - `npm run verify` exits 0
    - `npm run test -- src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions` reports 6 passed, 0 failed
    - `npm run test:integration -- src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions.integration.test.ts` reports 2 passed (when run with valid `.env.test.local`)
    - `git log -1 --name-only` shows the two production files (and nothing else)
  </acceptance_criteria>
  <done>HARDEN-03 closed: deletion is permanent, regression covered at unit and integration levels, UI reflects the new semantics, no new migration required.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Admin UI → server action | "Delete" button must actually delete; UI promises the destructive action and the action must perform it. |
| Server action → Supabase Auth | Service-role client mutates `auth.users`; cascade FKs propagate the delete. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-3-01 | Spoofing / Elevation of Privilege | Deleted user re-authenticates because `auth.users` row is intact | mitigate | Task 3 calls `admin.auth.admin.deleteUser`; integration Test 1 asserts re-auth fails. |
| T-01-3-02 | Information Disclosure | Cascade leaves orphan rows pointing at a deleted user | mitigate | Migration 001 already declares `on delete cascade` on every user-scoped FK; integration Test 2 pins this contract. |
| T-01-3-03 | Denial of Service | Last-owner deletion locks all admins out of the platform | mitigate | Task 3 adds the last-owner guard (D-06); unit Test 2 pins the contract. |
| T-01-3-04 | Repudiation | Audit log entries authored by the deleted user lose their actor | accept | `audit_log.user_id ... on delete set null` (migration 001 line 300) is intentional; the historical event is preserved with a null actor. |

threat_model:
  threats_mitigated:
    - id: T-01-3-01
      description: Deleted user re-authenticates via the still-extant auth.users row
      severity: high
      mitigation: Task 3 calls admin.auth.admin.deleteUser; integration test asserts signInWithPassword fails after delete.
    - id: T-01-3-02
      description: User-scoped data orphans after delete
      severity: medium
      mitigation: Migration 001 cascades; integration test pins the contract; no new migration needed (D-05).
    - id: T-01-3-03
      description: Last-owner deletion locks platform out of admin access
      severity: high
      mitigation: Last-owner guard added in Task 3; unit test enforces the branch.
  residual_risk:
    - description: Self-service "request a new invite" flow is out of scope (deferred per CONTEXT.md). A deleted user with no admin available cannot self-restore. Severity low — admin can re-invite.
  asvs_mapping: V2.1 (Password Security), V3.3 (Session Termination), V4.2 (Operation Level Access Control), V8.1 (General Data Protection)
</threat_model>

<verification>
- `npm run verify` exits 0
- `npm run test -- src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions` reports 6 passed
- `npm run test:integration -- src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions.integration.test.ts` reports 2 passed when run against the real Supabase project with `.env.test.local` populated
- The four grep checks in Task 3's `<acceptance_criteria>` all match
- Two distinct commits in `git log`: a `test(01-auth):` commit then a `feat(01-auth):` commit

Out of scope for this plan (deferred to Phase 4):
- Playwright e2e of the admin delete flow (TEST-03)
- RLS-level "block reads for suspended profiles" — separate semantics from delete (left in CONCERNS.md as a possible future enhancement)
- Self-service invite-request flow (CONTEXT.md `## Deferred`)
</verification>

<success_criteria>
- HARDEN-03 acceptance criterion met: a deleted user cannot re-authenticate and the regression test asserts this against the real Supabase project
- The cascade contract (D-05) is pinned by an integration test even though no new migration ships
- The last-owner guard (D-06) protects against accidental platform lockout
- The user-edit-form confirm copy reflects "delete", not "suspend"
- Failing-tests commit precedes implementation commit (TDD per AGENTS.md)
</success_criteria>

<output>
After completion, create `.planning/phases/01-auth-and-access-hardening/01-3-SUMMARY.md` summarising:
- HARDEN-03 closed; deleteUser uses admin auth client; unit + integration regression in place
- Commit shas for test + impl commits
- Confirmation that `npm run verify` is green AND that the integration suite passes when run against the configured project
- Note that this plan establishes the codebase's first `*.integration.test.ts` and the throwaway-user pattern other Phase 4 integration tests will follow
</output>
