---
phase: 01-auth-and-access-hardening
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/auth/callback/route.ts
  - src/app/auth/callback/route.test.ts
  - src/app/(auth)/login/page.tsx
  - src/app/(dashboard)/admin/users/page.tsx
  - src/app/(dashboard)/admin/users/actions.ts
  - src/app/(dashboard)/admin/users/actions.test.ts
  - src/app/(dashboard)/admin/users/resend-invite-button.tsx
autonomous: true
tasks_total: 4
requirements:
  - HARDEN-02
must_haves:
  truths:
    - The auth callback compares `invites.expires_at > now()` and applies role assignment only when active (D-02)
    - An expired invite token redirects the user to /login?error=invite_expired and writes no role rows (D-02)
    - An active invite continues to apply system_role and role_group_ids exactly as before (D-02)
    - applyInvite returns a discriminated union `{ ok: true } | { ok: false; reason: "expired" }` so the GET handler can branch (D-02)
    - The /login page renders dedicated copy when ?error=invite_expired is present, distinct from the existing invite_failed copy (D-01)
    - The admin users page flags expired invites visually with a destructive Badge (D-03)
    - The admin users page exposes a Resend control next to Revoke that mints a new token + fresh expires_at and re-fires the Supabase invite email (D-03)
  artifacts:
    - path: src/app/auth/callback/route.ts
      provides: applyInvite returns discriminated union; GET handler branches on expired
      contains: "invite_expired"
    - path: src/app/auth/callback/route.test.ts
      provides: Vitest unit covering active and expired invite branches
    - path: src/app/(auth)/login/page.tsx
      provides: Renders dedicated copy for ?error=invite_expired
      contains: "invite_expired"
    - path: src/app/(dashboard)/admin/users/page.tsx
      provides: Expired-badge + Resend button row in the pending invites table
      contains: "isExpired"
    - path: src/app/(dashboard)/admin/users/actions.ts
      provides: New resendInvite server action mints token, updates expires_at, re-fires invite email
      contains: "export async function resendInvite"
    - path: src/app/(dashboard)/admin/users/actions.test.ts
      provides: Vitest unit covering resendInvite requireAdmin gating, admin client failure, accepted-invite rejection, missing-invite rejection, token rotation, and inviteUserByEmail failure surfacing
    - path: src/app/(dashboard)/admin/users/resend-invite-button.tsx
      provides: Client component invoking resendInvite via useTransition
  key_links:
    - from: src/app/auth/callback/route.ts
      to: src/app/(auth)/login/page.tsx
      via: NextResponse.redirect with ?error=invite_expired
      pattern: "invite_expired"
    - from: src/app/(dashboard)/admin/users/resend-invite-button.tsx
      to: src/app/(dashboard)/admin/users/actions.ts
      via: import { resendInvite } from "./actions"
      pattern: "resendInvite"
    - from: src/app/(dashboard)/admin/users/actions.ts
      to: src/lib/supabase/admin.ts
      via: createAdminClient().auth.admin.inviteUserByEmail
      pattern: "inviteUserByEmail"
---

<objective>
Close HARDEN-02: the auth callback rejects expired invites before applying any role assignment, the login page renders dedicated copy for the new error code, and admins can resend a fresh invite from the users list.

Purpose: `applyInvite` in `src/app/auth/callback/route.ts` currently fetches the invite row but does not check `expires_at`, so a 14-day-stale link still grants `system_role` and `role_group_ids`. CONCERNS.md flags this; REQUIREMENTS.md mandates a unit test covering both an expired and an active invite.

Output:
- `applyInvite` returns `{ ok: true } | { ok: false; reason: "expired" }` (per D-02). Existing void callers swap to the discriminated union.
- The GET handler redirects to `/login?error=invite_expired` when the result is `{ ok: false, reason: "expired" }`.
- The `/login` page chains a third branch on `urlError === "invite_expired"` rendering the D-01 copy.
- The admin users page flags expired invites with a `<Badge variant="destructive">Expired</Badge>` and adds a `<ResendInviteButton>` alongside the existing Revoke control.
- A new `resendInvite(inviteId)` server action lives in the existing `actions.ts`.
- A new `ResendInviteButton` client component mirrors the existing `revoke-invite-button.tsx` shape verbatim with the action name and copy swapped (D-03).
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
@src/app/auth/callback/route.ts
@src/app/(auth)/login/page.tsx
@src/app/(dashboard)/admin/users/page.tsx
@src/app/(dashboard)/admin/users/actions.ts
@src/app/(dashboard)/admin/users/revoke-invite-button.tsx
@src/lib/supabase/admin.ts

<interfaces>
<!-- Contracts the executor will consume directly. -->

From src/app/auth/callback/route.ts (existing applyInvite, lines 67-96, summarised in 01-PATTERNS.md):
- Currently returns `Promise<void>`
- Reads `invites` row by `token`, returns early on `!invite || invite.accepted_at`
- Applies role assignment via two admin-client calls: profile update + user_role_groups insert

NEW return type contract (D-02):
```typescript
type ApplyResult = { ok: true } | { ok: false; reason: "expired" };
async function applyInvite(...): Promise<ApplyResult>
```

The GET handler at the call site reads `result.ok` and `result.reason` to decide redirect.

From src/app/(auth)/login/page.tsx, lines 49-53 (existing chain):
```typescript
const errorMessage =
  actionError ??
  (urlError === "invite_failed"
    ? "Invite link couldn't be verified. Ask an admin to resend it."
    : null);
```
Extend to branch on `invite_expired` per D-01.

From src/app/(dashboard)/admin/users/revoke-invite-button.tsx (verbatim shape to clone):
```typescript
"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revokeInvite } from "./actions";

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await revokeInvite(inviteId);
          if (!result.ok) toast.error(result.error);
          else toast.success("Invite revoked.");
        });
      }}>
      {pending ? "..." : "Revoke"}
    </Button>
  );
}
```

From src/app/(dashboard)/admin/users/actions.ts (existing inviteUser, lines 28-102):
- Imports already present: `randomBytes` from `node:crypto`, `revalidatePath` from `next/cache`, `requireAdmin`, `createClient`, `createAdminClient`, `sendEmail`, `renderEnrollmentEmail`
- Mints token: `randomBytes(32).toString("base64url")`
- 14-day expiry: `new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()`
- Calls `admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { invited_by, system_role } })`
- redirectTo: `${appUrl.replace(/\/$/, "")}/auth/callback?invite_token=${encodeURIComponent(token)}`

Discriminated-union shape used throughout this file:
```typescript
{ ok: true } | { ok: false; error: string }
```

`createAdminClient()` throws when env vars missing — wrap in try/catch, narrow with `e instanceof Error ? e.message : "Admin client unavailable."`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Test inventory review</name>
  <files>(no files written; reviewable contract)</files>
  <read_first>
    - .planning/phases/01-auth-and-access-hardening/01-CONTEXT.md (D-01, D-02, D-03)
    - .planning/phases/01-auth-and-access-hardening/01-PATTERNS.md (sections "src/app/auth/callback/route.ts — HARDEN-02" and "src/app/(dashboard)/admin/users/actions.ts — HARDEN-02 new resendInvite")
    - .planning/codebase/TESTING.md (sections "Mocking", "Test Structure", "Per-test data")
    - src/app/auth/callback/route.ts (the function under test)
  </read_first>
  <action>
Enumerate the failing test inventory for HARDEN-02. Per REQUIREMENTS.md the unit test must cover BOTH an expired invite and an active invite; per D-01 the login page must render distinct copy for `invite_expired`; per D-03 the admin list shows an expired badge and a Resend button.

Inventory (2 test files, 10 `it` cases total: 4 for `applyInvite`, 6 for `resendInvite`):

`src/app/auth/callback/route.test.ts` — `describe("applyInvite (HARDEN-02)")`

1. `it("applies role assignment when the invite is active")`
   - Mock `@/lib/supabase/admin` so `createAdminClient` returns a stub admin client whose `from("invites").select(...).eq("token", ...).maybeSingle()` resolves to `{ data: { id: "inv-1", system_role: "admin", role_group_ids: ["g1"], accepted_at: null, expires_at: <now + 1 day ISO> }, error: null }`.
   - Call `applyInvite({ userId: "u-1", token: "tok-1" })`.
   - Assert the result is `{ ok: true }`.
   - Assert the admin client was used to write `profiles.update({ system_role: "admin" })` AND to insert one row into `user_role_groups`. (Pull both spies from the mock and check `.toHaveBeenCalled()`.)

2. `it("rejects with reason 'expired' when expires_at is in the past")`
   - Same mock shape but `expires_at: <now - 1 minute ISO>`.
   - Assert result is `{ ok: false, reason: "expired" }`.
   - Assert NO write to `profiles` or `user_role_groups` occurred (`.update` and `.insert` spies report zero calls).

3. `it("returns ok when the invite has already been accepted")`
   - `accepted_at` non-null, `expires_at` arbitrary.
   - Assert result is `{ ok: true }` (existing pre-HARDEN-02 contract — preserved).
   - Assert no write occurred.

4. `it("returns ok when no matching invite row exists")`
   - `maybeSingle` resolves `{ data: null, error: null }`.
   - Assert result is `{ ok: true }`.
   - Assert no write occurred.

Mocking strategy:
- Mock `@/lib/supabase/admin`'s `createAdminClient` (this file's only Supabase touch point).
- Build a fluent stub: `from(table).select(cols).eq(col, val).maybeSingle()` resolves to a configurable value. Reset between tests via `beforeEach`.
- Use `vi.mock("@/lib/supabase/admin", ...)` and reset implementation per test.
- Do NOT mock `next/server`'s `NextResponse` — `applyInvite` does not use it; the GET handler does, and the GET handler is not under unit test in this plan (covered indirectly by the active/expired branches via integration in Phase 4).

`src/app/(dashboard)/admin/users/actions.test.ts` — `describe("resendInvite (HARDEN-02)")`

5. `it("calls requireAdmin before any Supabase work")`
   - Mock `@/lib/auth/guard`'s `requireAdmin` to record call order against the learner-client and admin-client mocks (same call-order pattern as plan 1-1's HARDEN-01 test).
   - Mock `@/lib/supabase/server` and `@/lib/supabase/admin` so each `from(...)` push appends a label to a shared `calls: string[]` log.
   - Call `resendInvite("inv-1")` with a valid invite row and a successful `inviteUserByEmail`.
   - Assert `calls[0] === "requireAdmin"` and that `requireAdmin`'s index is strictly less than any `from("invites")` or `inviteUserByEmail` index.

6. `it("returns the admin client error when env vars are missing")`
   - Mock `createAdminClient` to throw `new Error("Service role key missing")`.
   - Assert result is `{ ok: false, error: "Service role key missing" }`.
   - Assert no `from("invites")` lookup or update was attempted.

7. `it("rejects when the invite has already been accepted")`
   - Lookup returns `{ id: "inv-1", email: "u@example.com", system_role: "admin", role_group_ids: [], accepted_at: "2026-04-01T00:00:00.000Z" }`.
   - Assert result is `{ ok: false, error: "This invite was already accepted." }`.
   - Assert no `update` and no `inviteUserByEmail` was called.

8. `it("rejects when the invite is not found")`
   - Lookup `maybeSingle` resolves `{ data: null, error: null }`.
   - Assert result is `{ ok: false, error: "Invite not found." }`.
   - Assert no `update` and no `inviteUserByEmail` was called.

9. `it("rotates the token and refreshes expires_at on the happy path")`
   - Lookup returns an active invite with `accepted_at: null` and a fixed `token: "old-token"`.
   - Capture the patch object passed to `from("invites").update(...)`. Capture the `redirectTo` argument passed to `inviteUserByEmail`.
   - Assert the captured `patch.token` is a non-empty string AND `patch.token !== "old-token"`.
   - Assert `new Date(patch.expires_at).getTime() > Date.now()` (a future timestamp).
   - Assert `inviteUserByEmail` was called with the invite's email and a `redirectTo` containing `encodeURIComponent(patch.token)`.
   - Assert result is `{ ok: true }`.

10. `it("surfaces inviteUserByEmail failure")`
    - Lookup returns an active invite. The token-rotation `update` succeeds. `inviteUserByEmail` resolves `{ error: { message: "rate limited" } }`.
    - Assert result is `{ ok: false, error: "Supabase rejected the invite: rate limited" }`.
    - Per AGENTS.md "Don't mark work done without a covering test", this case pins the error-surfacing contract; the row-rollback semantic is documented as accepted residual risk (the token has already rotated, but the next click hits an unsent email so the admin must Resend again — acceptable since the invite is still active server-side).

Mocking strategy for File B:
- Mock `@/lib/auth/guard`'s `requireAdmin` to return a fixed admin profile.
- Mock `@/lib/supabase/server`'s `createClient` so `from("invites").select(...).eq(...).maybeSingle()` resolves to a per-test `inviteRow`, and `from("invites").update(...).eq(...)` records the patch object.
- Mock `@/lib/supabase/admin`'s `createAdminClient` so `auth.admin.inviteUserByEmail(email, opts)` records its arguments and resolves to a per-test result.
- Mock `next/cache`'s `revalidatePath` as a no-op.

Out-of-scope tests (deliberately deferred): GET handler integration (covered by TEST-01 in Phase 4); Playwright e2e of the resend flow (covered by TEST-03 in Phase 4); the existing untested `inviteUser` and `revokeInvite` actions in the same file (TEST-01 in Phase 4 sweeps both holistically). The ten cases above are the minimum sufficient set for HARDEN-02 closure.

This inventory is the contract.
  </action>
  <verify>
    <automated>echo "Test inventory enumerated; awaiting reviewer ack."</automated>
  </verify>
  <acceptance_criteria>
    - Task summary lists 2 test files and 10 `it` cases (4 for `applyInvite` in route.test.ts, 6 for `resendInvite` in actions.test.ts)
    - Each case names what it asserts and which mock state triggers it
    - The boundary (only `applyInvite` and `resendInvite` are unit-tested in this plan; existing `inviteUser` and `revokeInvite` plus the GET handler integration are deferred to TEST-01 in Phase 4) is named explicitly
  </acceptance_criteria>
  <done>The inventory is the single contract for the two failing-tests commits (Tasks 2 and 3).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Write failing tests and commit</name>
  <files>
    - src/app/auth/callback/route.test.ts
  </files>
  <read_first>
    - src/app/auth/callback/route.ts (the file under test — confirm `applyInvite` is currently NOT exported; if not exported, this plan must export it)
    - src/lib/supabase/admin.ts (the `createAdminClient` factory being mocked — line 14-18 throws on missing env)
    - src/lib/quizzes/score.test.ts (style reference for `describe`/`it`)
  </read_first>
  <behavior>
    - Test 1: active invite → `{ ok: true }`, profile update + role-group insert called
    - Test 2: expired invite → `{ ok: false, reason: "expired" }`, no writes
    - Test 3: already-accepted invite → `{ ok: true }`, no writes
    - Test 4: missing invite row → `{ ok: true }`, no writes
    - All four cases fail at this commit because `applyInvite` does not yet check `expires_at` and does not yet return a discriminated union
  </behavior>
  <action>
Step 1 — confirm export. Read `src/app/auth/callback/route.ts` to determine whether `applyInvite` is exported. If not, the failing-tests commit cannot import it. In that case, the failing tests will use `import { applyInvite } from "./route"` and the implementation commit (Task 4) is responsible for adding `export` to the function. Write the tests assuming the export will exist; the failure mode at this commit is a TypeScript compile error, which IS an acceptable red state per AGENTS.md TDD ("write the failing tests first" — failure can be a compile error or a runtime assertion).

Step 2 — write the test file. File header:

```typescript
// HARDEN-02: regression for applyInvite expiry handling.
// Mocks @/lib/supabase/admin to exercise the four invite states.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

Build the stub admin client. Use a factory that the test body re-configures per case:

```typescript
type InviteRow = {
  id: string;
  system_role: string;
  role_group_ids: string[];
  accepted_at: string | null;
  expires_at: string;
} | null;

let inviteRow: InviteRow = null;
const profileUpdate = vi.fn(async () => ({ error: null }));
const userRoleInsert = vi.fn(async () => ({ error: null }));
const userRoleDelete = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "invites") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: inviteRow, error: null }),
            }),
          }),
          update: (patch: unknown) => ({
            eq: async () => {
              // mark accepted_at: record only, no real DB
              return { error: null };
            },
          }),
        };
      }
      if (table === "profiles") {
        return {
          update: (patch: unknown) => ({
            eq: async () => {
              await profileUpdate(patch);
              return { error: null };
            },
          }),
        };
      }
      if (table === "user_role_groups") {
        return {
          delete: () => ({
            eq: async () => {
              await userRoleDelete();
              return { error: null };
            },
          }),
          insert: async (rows: unknown) => {
            await userRoleInsert(rows);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  })),
}));

import { applyInvite } from "./route";
```

Test cases:

```typescript
describe("applyInvite (HARDEN-02)", () => {
  beforeEach(() => {
    inviteRow = null;
    profileUpdate.mockClear();
    userRoleInsert.mockClear();
    userRoleDelete.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("applies role assignment when the invite is active", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    inviteRow = {
      id: "inv-1",
      system_role: "admin",
      role_group_ids: ["g1"],
      accepted_at: null,
      expires_at: future,
    };

    const result = await applyInvite({ userId: "u-1", token: "tok-1" });
    expect(result).toEqual({ ok: true });
    expect(profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ system_role: "admin" }),
    );
    expect(userRoleInsert).toHaveBeenCalled();
  });

  it("rejects with reason 'expired' when expires_at is in the past", async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    inviteRow = {
      id: "inv-2",
      system_role: "admin",
      role_group_ids: ["g1"],
      accepted_at: null,
      expires_at: past,
    };

    const result = await applyInvite({ userId: "u-1", token: "tok-2" });
    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(userRoleInsert).not.toHaveBeenCalled();
  });

  it("returns ok when the invite has already been accepted", async () => {
    inviteRow = {
      id: "inv-3",
      system_role: "admin",
      role_group_ids: ["g1"],
      accepted_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const result = await applyInvite({ userId: "u-1", token: "tok-3" });
    expect(result).toEqual({ ok: true });
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(userRoleInsert).not.toHaveBeenCalled();
  });

  it("returns ok when no matching invite row exists", async () => {
    inviteRow = null;
    const result = await applyInvite({ userId: "u-1", token: "tok-missing" });
    expect(result).toEqual({ ok: true });
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(userRoleInsert).not.toHaveBeenCalled();
  });
});
```

Run `npm run test -- src/app/auth/callback`. Expected red state: either compile error (`applyInvite` not exported / does not accept that signature) or runtime failure (returns void, so `expect(result).toEqual({ ok: true })` fails for case 1).

Commit:
```
test(01-auth): HARDEN-02 failing regression for invite expiry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run test -- src/app/auth/callback 2>&1 | tee /tmp/harden-02-red.log; tail -30 /tmp/harden-02-red.log</automated>
  </verify>
  <acceptance_criteria>
    - `src/app/auth/callback/route.test.ts` exists with the four `it` cases listed above
    - `npm run test -- src/app/auth/callback` shows the suite as failing (compile or runtime)
    - The commit message starts with `test(01-auth):`
    - `git log -1 --name-only` shows ONLY `src/app/auth/callback/route.test.ts`
  </acceptance_criteria>
  <done>Failing tests committed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Write failing tests for resendInvite and commit</name>
  <files>
    - src/app/(dashboard)/admin/users/actions.test.ts
  </files>
  <read_first>
    - src/app/(dashboard)/admin/users/actions.ts (the file under test. Note `resendInvite` does not yet exist; the failing tests will reference it as the import target and the implementation in Task 4 creates it. Confirm the existing imports at the top of the file so the test mocks match: `requireAdmin`, `createClient`, `createAdminClient`, `randomBytes`, `revalidatePath`)
    - src/app/(dashboard)/admin/users/revoke-invite-button.tsx (style reference for client-component shape, not under test here)
    - src/lib/supabase/admin.ts (the `createAdminClient` factory being mocked. Line 14-18 throws on missing env)
    - src/lib/quizzes/score.test.ts (style reference for `describe`/`it` naming)
    - .planning/phases/01-auth-and-access-hardening/01-1-admin-route-guards-PLAN.md Task 2 (canonical analog for the requireAdmin call-order pattern)
  </read_first>
  <behavior>
    - Test 1: `requireAdmin` resolves before any Supabase work (`from("invites")` lookup, `from("invites").update(...)`, `inviteUserByEmail`). Asserted via call-order log.
    - Test 2: `createAdminClient` throwing surfaces as `{ ok: false, error: <message> }` with no Supabase write attempted.
    - Test 3: Invite already accepted returns `{ ok: false, error: "This invite was already accepted." }` with no token rotation and no email re-fire.
    - Test 4: Invite not found returns `{ ok: false, error: "Invite not found." }` with no token rotation and no email re-fire.
    - Test 5: Happy path rotates the token (new value differs from previous) and pushes a future `expires_at`; `inviteUserByEmail` is called with the new token in `redirectTo`.
    - Test 6: `inviteUserByEmail` failure surfaces as `{ ok: false, error: "Supabase rejected the invite: <message>" }`.
    - Tests fail at this commit because `resendInvite` is not yet defined in `src/app/(dashboard)/admin/users/actions.ts`. Failure mode is a TypeScript compile error or a runtime "is not a function" error. Both are acceptable red states per AGENTS.md TDD.
  </behavior>
  <action>
Create `src/app/(dashboard)/admin/users/actions.test.ts` exactly as specified by Task 1's inventory (cases 5-10).

File header:

```typescript
// HARDEN-02: regression for resendInvite. Six branches covering requireAdmin
// gating, admin client failure, accepted-invite rejection, missing-invite
// rejection, token rotation on the happy path, and inviteUserByEmail failure
// surfacing. Mocks @/lib/auth/guard, @/lib/supabase/server, @/lib/supabase/admin,
// and next/cache. Uses the same call-order pattern as plan 1-1's HARDEN-01
// regression so requireAdmin gating is verified, not just exercised.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

Module-level state and mocks. Follow the call-order pattern from plan 1-1's `page.test.ts`. The shared `calls: string[]` log records every guarded operation in invocation order so Test 1 can assert ordering directly:

```typescript
const calls: string[] = [];

let inviteRow:
  | {
      id: string;
      email: string;
      system_role: string;
      role_group_ids: string[];
      accepted_at: string | null;
    }
  | null = null;

let lookupError: { message: string } | null = null;
let updatePatch: Record<string, unknown> | null = null;
let updateError: { message: string } | null = null;
let inviteEmailArgs: { email: string; opts: Record<string, unknown> } | null = null;
let inviteEmailError: { message: string } | null = null;
let adminFactoryThrows: Error | null = null;

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => {
    calls.push("requireAdmin");
    return { id: "admin-1", email: "admin@bmh.test", system_role: "owner" };
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table !== "invites") {
        throw new Error(`Unexpected learner-client table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              calls.push("invites.select");
              return { data: inviteRow, error: lookupError };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updatePatch = patch;
          return {
            eq: async () => {
              calls.push("invites.update");
              return { error: updateError };
            },
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
      auth: {
        admin: {
          inviteUserByEmail: vi.fn(async (email: string, opts: Record<string, unknown>) => {
            inviteEmailArgs = { email, opts };
            calls.push("inviteUserByEmail");
            return { data: null, error: inviteEmailError };
          }),
        },
      },
    };
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { resendInvite } from "./actions";
```

Test cases:

```typescript
describe("resendInvite (HARDEN-02)", () => {
  beforeEach(() => {
    calls.length = 0;
    inviteRow = null;
    lookupError = null;
    updatePatch = null;
    updateError = null;
    inviteEmailArgs = null;
    inviteEmailError = null;
    adminFactoryThrows = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls requireAdmin before any Supabase work", async () => {
    inviteRow = {
      id: "inv-1",
      email: "u@example.com",
      system_role: "admin",
      role_group_ids: [],
      accepted_at: null,
    };
    const result = await resendInvite("inv-1");
    expect(result).toEqual({ ok: true });
    expect(calls[0]).toBe("requireAdmin");
    const guardIdx = calls.indexOf("requireAdmin");
    const supabaseFirstIdx = Math.min(
      ...["invites.select", "invites.update", "inviteUserByEmail"]
        .map((label) => calls.indexOf(label))
        .filter((idx) => idx >= 0),
    );
    expect(guardIdx).toBeLessThan(supabaseFirstIdx);
  });

  it("returns the admin client error when env vars are missing", async () => {
    adminFactoryThrows = new Error("Service role key missing");
    const result = await resendInvite("inv-1");
    expect(result).toEqual({ ok: false, error: "Service role key missing" });
    expect(calls).not.toContain("invites.select");
    expect(calls).not.toContain("invites.update");
    expect(calls).not.toContain("inviteUserByEmail");
  });

  it("rejects when the invite has already been accepted", async () => {
    inviteRow = {
      id: "inv-1",
      email: "u@example.com",
      system_role: "admin",
      role_group_ids: [],
      accepted_at: "2026-04-01T00:00:00.000Z",
    };
    const result = await resendInvite("inv-1");
    expect(result).toEqual({
      ok: false,
      error: "This invite was already accepted.",
    });
    expect(calls).not.toContain("invites.update");
    expect(calls).not.toContain("inviteUserByEmail");
  });

  it("rejects when the invite is not found", async () => {
    inviteRow = null;
    const result = await resendInvite("inv-missing");
    expect(result).toEqual({ ok: false, error: "Invite not found." });
    expect(calls).not.toContain("invites.update");
    expect(calls).not.toContain("inviteUserByEmail");
  });

  it("rotates the token and refreshes expires_at on the happy path", async () => {
    inviteRow = {
      id: "inv-1",
      email: "u@example.com",
      system_role: "admin",
      role_group_ids: [],
      accepted_at: null,
    };
    const before = Date.now();
    const result = await resendInvite("inv-1");
    expect(result).toEqual({ ok: true });
    expect(updatePatch).not.toBeNull();
    const newToken = updatePatch!.token as string;
    expect(typeof newToken).toBe("string");
    expect(newToken.length).toBeGreaterThan(0);
    expect(newToken).not.toBe("old-token");
    const newExpiry = new Date(updatePatch!.expires_at as string).getTime();
    expect(newExpiry).toBeGreaterThan(before);
    expect(inviteEmailArgs).not.toBeNull();
    expect(inviteEmailArgs!.email).toBe("u@example.com");
    expect(String(inviteEmailArgs!.opts.redirectTo)).toContain(
      encodeURIComponent(newToken),
    );
  });

  it("surfaces inviteUserByEmail failure", async () => {
    inviteRow = {
      id: "inv-1",
      email: "u@example.com",
      system_role: "admin",
      role_group_ids: [],
      accepted_at: null,
    };
    inviteEmailError = { message: "rate limited" };
    const result = await resendInvite("inv-1");
    expect(result).toEqual({
      ok: false,
      error: "Supabase rejected the invite: rate limited",
    });
  });
});
```

Run:
```
npm run test -- src/app/\(dashboard\)/admin/users/actions
```

Expected red state: every case fails (compile error: `resendInvite` is not exported from `./actions`, or runtime: `resendInvite is not a function`). This is the contract that Task 4's implementation must satisfy.

Commit (only the new test file in this commit; no production-code changes):
```
test(01-auth): HARDEN-02 failing regression for resendInvite admin action

Six unit cases pinning requireAdmin gating, admin client acquisition
failure, accepted-invite rejection, missing-invite rejection, happy-path
token rotation, and inviteUserByEmail failure surfacing for the new
resendInvite server action introduced in plan 1-2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run test -- src/app/\(dashboard\)/admin/users/actions 2>&1 | tee /tmp/harden-02-resend-red.log; tail -30 /tmp/harden-02-resend-red.log</automated>
  </verify>
  <acceptance_criteria>
    - `src/app/(dashboard)/admin/users/actions.test.ts` exists with the six `it` cases listed above
    - `npm run test -- src/app/\(dashboard\)/admin/users/actions` shows the suite as failing (compile or runtime)
    - The commit message starts with `test(01-auth):`
    - `git log -1 --name-only` shows ONLY `src/app/(dashboard)/admin/users/actions.test.ts`
  </acceptance_criteria>
  <done>Failing tests for resendInvite committed. Implementation in Task 4 makes them pass alongside the applyInvite implementation.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Implement expiry check, login copy, admin resend, and commit</name>
  <files>
    - src/app/auth/callback/route.ts
    - src/app/(auth)/login/page.tsx
    - src/app/(dashboard)/admin/users/page.tsx
    - src/app/(dashboard)/admin/users/actions.ts
    - src/app/(dashboard)/admin/users/resend-invite-button.tsx
  </files>
  <read_first>
    - src/app/auth/callback/route.ts (current applyInvite — must be modified, not replaced)
    - src/app/(auth)/login/page.tsx (lines 49-53 — the ternary chain to extend)
    - src/app/(dashboard)/admin/users/page.tsx (lines 32-35 select; lines 129-171 pending-invites table)
    - src/app/(dashboard)/admin/users/actions.ts (existing inviteUser, lines 28-102 — analog for resendInvite)
    - src/app/(dashboard)/admin/users/revoke-invite-button.tsx (verbatim shape to clone)
    - src/components/ui/badge.tsx (confirm `variant="destructive"` is supported — it is, per existing usage in admin/users/page.tsx line 89-91)
    - .planning/phases/01-auth-and-access-hardening/01-PATTERNS.md (every section under HARDEN-02)
  </read_first>
  <action>
Five file changes, applied in this order. After all are in place, the four `applyInvite` tests must pass and `npm run verify` must be green.

**1. `src/app/auth/callback/route.ts` — `applyInvite` returns discriminated union; GET handler branches.**

Add the type and export the function (so the test can import it):
```typescript
export type ApplyInviteResult = { ok: true } | { ok: false; reason: "expired" };

export async function applyInvite({
  userId,
  token,
}: {
  userId: string;
  token: string;
}): Promise<ApplyInviteResult> {
  // ...existing admin-client setup
  const { data: invite } = await admin
    .from("invites")
    .select("id, system_role, role_group_ids, accepted_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite || invite.accepted_at) return { ok: true };

  // HARDEN-02 / D-02: refuse expired invites before applying any role
  // assignment. Expired tokens redirect the caller back to /login with a
  // dedicated error code. The unit test in route.test.ts pins this contract.
  if (new Date(invite.expires_at as string) <= new Date()) {
    return { ok: false, reason: "expired" };
  }

  // ...existing role-apply body unchanged: profiles update + user_role_groups
  // delete + insert + invites.update({ accepted_at }), all preserved verbatim
  return { ok: true };
}
```

Key constraints:
- The expired check goes AFTER the `!invite || invite.accepted_at` early return (so already-accepted invites continue to short-circuit with `{ ok: true }` — matching the existing void-return semantics).
- The expired check goes BEFORE any profile/role-group write.
- All existing role-application code is preserved verbatim. Do not refactor it.

In the GET handler at the call site of `applyInvite`:
```typescript
if (inviteToken) {
  const result = await applyInvite({
    userId: data.session.user.id,
    token: inviteToken,
  });
  if (!result.ok && result.reason === "expired") {
    return NextResponse.redirect(`${origin}/login?error=invite_expired`);
  }
}
```

The existing `if (!code) return NextResponse.redirect(\`${origin}/login?error=invite_failed\`)` pattern at lines 22-25 is the verbatim style for this redirect. Use the same `origin` variable.

**2. `src/app/(auth)/login/page.tsx` — extend the error chain (D-01).**

Find the existing block (lines 49-53):
```typescript
const errorMessage =
  actionError ??
  (urlError === "invite_failed"
    ? "Invite link couldn't be verified. Ask an admin to resend it."
    : null);
```

Replace with:
```typescript
const errorMessage =
  actionError ??
  (urlError === "invite_failed"
    ? "Invite link couldn't be verified. Ask an admin to resend it."
    : urlError === "invite_expired"
    ? "This invite link has expired. Ask your admin to send you a fresh one."
    : null);
```

The exact copy "This invite link has expired. Ask your admin to send you a fresh one." is locked by D-01.

**3. `src/app/(dashboard)/admin/users/page.tsx` — expired badge + Resend button column.**

The existing `select` at lines 32-35 already includes `expires_at`; no query change.

Inside the pending-invites `.map((i) => ...)` block (around lines 144-171), compute `isExpired` per row, render a destructive Badge when expired, and add the Resend button alongside Revoke. Replace the existing per-row JSX with:

```typescript
{pendingInvites.map((i) => {
  const expires = new Date(i.expires_at as string);
  const isExpired = expires <= new Date();
  return (
    <TableRow key={i.id as string}>
      <TableCell>{i.email as string}</TableCell>
      <TableCell className="capitalize">
        {i.system_role as string}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {isExpired ? (
          <Badge variant="destructive">Expired</Badge>
        ) : (
          <>in {formatDistanceToNow(expires)}</>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <ResendInviteButton inviteId={i.id as string} />
          <RevokeInviteButton inviteId={i.id as string} />
        </div>
      </TableCell>
    </TableRow>
  );
})}
```

Add `import { ResendInviteButton } from "./resend-invite-button";` near the existing `RevokeInviteButton` import. Keep `Badge` import as-is (already imported per CONTEXT.md line 89-91 reference). If `Badge` is not yet imported in this file, add `import { Badge } from "@/components/ui/badge";` to the third-party/`@/`-block of imports per CONVENTIONS.md ordering.

The exact badge label "Expired" and button copy "Resend" / "Fresh invite sent." are within Claude's discretion per CONTEXT.md `## Claude's Discretion` — these defaults are the executor's choice and the inventory documents them.

**4. `src/app/(dashboard)/admin/users/actions.ts` — add `resendInvite` server action.**

Append a new exported function at the end of the file. No new imports needed (all are already present per PATTERNS.md). Match the discriminated-union return convention.

```typescript
export async function resendInvite(
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const inviter = await requireAdmin();

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Admin client unavailable.";
    return { ok: false, error: message };
  }

  const supabase = await createClient();
  const { data: invite, error: lookupErr } = await supabase
    .from("invites")
    .select("id, email, system_role, role_group_ids, accepted_at")
    .eq("id", inviteId)
    .maybeSingle();
  if (lookupErr || !invite) {
    return { ok: false, error: lookupErr?.message ?? "Invite not found." };
  }
  if (invite.accepted_at) {
    return { ok: false, error: "This invite was already accepted." };
  }

  const token = randomBytes(32).toString("base64url");
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  const newExpiry = new Date(Date.now() + fourteenDays).toISOString();

  const { error: updateErr } = await supabase
    .from("invites")
    .update({ token, expires_at: newExpiry })
    .eq("id", inviteId);
  if (updateErr) return { ok: false, error: updateErr.message };

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
  const redirectTo = `${appUrl.replace(/\/$/, "")}/auth/callback?invite_token=${encodeURIComponent(token)}`;

  // HARDEN-02 / D-03: re-fire the Supabase invite email through the existing
  // admin.auth.admin.inviteUserByEmail path (D-03 default: send a fresh
  // email, no new template). Skip the enrollment email re-send (already
  // sent at original invite).
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    invite.email as string,
    {
      redirectTo,
      data: {
        invited_by: inviter.email,
        system_role: invite.system_role as string,
      },
    },
  );
  if (inviteError) {
    return { ok: false, error: `Supabase rejected the invite: ${inviteError.message}` };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}
```

**5. `src/app/(dashboard)/admin/users/resend-invite-button.tsx` — new client component.**

Clone `revoke-invite-button.tsx` verbatim, swap action and copy:

```typescript
"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { resendInvite } from "./actions";

export function ResendInviteButton({ inviteId }: { inviteId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await resendInvite(inviteId);
          if (!result.ok) toast.error(result.error);
          else toast.success("Fresh invite sent.");
        });
      }}
    >
      {pending ? "..." : "Resend"}
    </Button>
  );
}
```

After all five changes, run:
- `npm run test -- src/app/auth/callback` -> all four `applyInvite` tests pass
- `npm run test -- src/app/\(dashboard\)/admin/users/actions` -> all six `resendInvite` tests pass
- `npm run verify` -> green

Commit:
```
feat(01-auth): HARDEN-02 enforce invite expiry and add admin resend

applyInvite returns a discriminated union and refuses expired tokens before
any role assignment. The auth callback redirects expired invites to
/login?error=invite_expired with dedicated copy. The admin users list flags
expired invites and exposes a Resend control that mints a fresh token and
re-fires the Supabase invite email. Closes Task 2's failing applyInvite
tests and Task 3's failing resendInvite tests in a single implementation
commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run test -- src/app/auth/callback 2>&1 | tail -10 && npm run test -- src/app/\(dashboard\)/admin/users/actions 2>&1 | tail -10 && npm run verify 2>&1 | tail -40 && grep -c "invite_expired" src/app/auth/callback/route.ts src/app/\(auth\)/login/page.tsx && grep -c "export async function resendInvite" src/app/\(dashboard\)/admin/users/actions.ts && test -f src/app/\(dashboard\)/admin/users/resend-invite-button.tsx && grep -c "isExpired" src/app/\(dashboard\)/admin/users/page.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `grep "invite_expired" src/app/(auth)/login/page.tsx` returns a match
    - `grep "invite_expired" src/app/auth/callback/route.ts` returns a match
    - `grep "reason: \"expired\"" src/app/auth/callback/route.ts` returns a match
    - `grep "export async function resendInvite" src/app/(dashboard)/admin/users/actions.ts` returns a match
    - `src/app/(dashboard)/admin/users/resend-invite-button.tsx` exists and exports `ResendInviteButton`
    - `grep "isExpired" src/app/(dashboard)/admin/users/page.tsx` returns a match
    - `npm run test -- src/app/auth/callback` reports 4 passed, 0 failed
    - `npm run test -- src/app/\(dashboard\)/admin/users/actions` reports 6 passed, 0 failed
    - `npm run verify` exits 0
    - `git log -1 --name-only` shows the five production files (and nothing else)
  </acceptance_criteria>
  <done>HARDEN-02 closed: callback enforces expiry, login renders dedicated copy, admin can resend, regression units cover applyInvite (active, expired, accepted, missing) AND resendInvite (requireAdmin gating, admin-client failure, accepted invite, missing invite, token rotation, inviteUserByEmail failure).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → /auth/callback | Untrusted invite token in query string is consumed to apply role assignment |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-2-01 | Elevation of Privilege | `applyInvite` in `src/app/auth/callback/route.ts` | mitigate | Compare `expires_at` to `now()` after the lookup and before any write; return `{ ok: false, reason: "expired" }` so the GET handler can redirect without applying roles. Regression unit pins all four states (active, expired, accepted, missing). |
| T-01-2-02 | Spoofing | A stale invite link reused after the original email | mitigate | The expiry check enforces the 14-day window already encoded in `invites.expires_at`. The Resend control mints a NEW token + new `expires_at`; the old token remains invalid because the row's `token` column is overwritten in the update. |
| T-01-2-03 | Information Disclosure | Login page error rendering | accept | Distinct copy reveals only that the invite expired (not who it was for or what role it would have granted). Equivalent to the existing `invite_failed` disclosure level. |

threat_model:
  threats_mitigated:
    - id: T-01-2-01
      description: Stale invite token grants role access after the 14-day expiry window
      severity: high
      mitigation: Task 4 enforces `expires_at > now()` in `applyInvite`; Task 2's regression unit fails if the check is removed.
    - id: T-01-2-02
      description: Replayed invite token after admin resend
      severity: medium
      mitigation: Resend mints a fresh `token` and overwrites the row; the previous token no longer matches.
  residual_risk:
    - description: Admin invites table expiry is checked at callback time only. Between the original mint and the user's first click there is no proactive notification to the admin that the invite expired. Severity low — admin sees the expired badge in the users list now, and the user sees the dedicated copy on /login.
  asvs_mapping: V3.2 (Session Binding), V3.3 (Session Termination), V4.2 (Operation Level Access Control)
</threat_model>

<verification>
- `npm run verify` exits 0
- `npm run test -- src/app/auth/callback` reports 4 passed
- `npm run test -- src/app/\(dashboard\)/admin/users/actions` reports 6 passed
- The six grep checks in Task 4's `<verify>` block all pass
- Three distinct commits in `git log`, in order: `test(01-auth): HARDEN-02 failing regression for invite expiry` (Task 2), `test(01-auth): HARDEN-02 failing regression for resendInvite admin action` (Task 3), `feat(01-auth): HARDEN-02 enforce invite expiry and add admin resend` (Task 4)
- Manual smoke (defer to /gsd-execute-phase): visit `/login?error=invite_expired` and confirm the copy renders verbatim per D-01

Out of scope for this plan (deferred to Phase 4):
- Playwright e2e of the resend flow (TEST-03)
- Unit tests for the existing untested `inviteUser` and `revokeInvite` actions (TEST-01 sweep in Phase 4 covers both holistically; this plan only adds coverage for the new `resendInvite` action it introduces)
- GET-handler integration test (TEST-01 sweep)
</verification>

<success_criteria>
- HARDEN-02 acceptance criterion met: the callback rejects expired invites and the unit test covers both an expired and an active branch
- The `/login` page renders distinct copy for `?error=invite_expired` per D-01
- The admin users page surfaces the expired state and the Resend control per D-03
- The new `resendInvite` server action ships with its own unit suite covering requireAdmin gating, admin-client failure, accepted-invite rejection, missing-invite rejection, token rotation, and inviteUserByEmail failure (AGENTS.md: "Don't mark work done without a covering test")
- Both failing-tests commits precede the implementation commit (TDD per AGENTS.md): Task 2 lands `applyInvite` tests, Task 3 lands `resendInvite` tests, Task 4 lands the implementation
</success_criteria>

<output>
After completion, create `.planning/phases/01-auth-and-access-hardening/01-2-SUMMARY.md` summarising:
- HARDEN-02 closed; four `applyInvite` states + six `resendInvite` cases covered by the units
- Commit shas for the two test commits and the implementation commit
- Confirmation that `npm run verify` is green
- Note that admin Resend smoke verification is a recommended manual check on next deploy
</output>
