---
phase: 01-auth-and-access-hardening
plan: 4
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/008_answer_options_public_view.sql
  - src/app/(dashboard)/lessons/[lessonId]/page.tsx
  - src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts
  - src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts
  - src/app/(dashboard)/lessons/[lessonId]/answer-options-isolation.integration.test.ts
autonomous: false
requirements:
  - HARDEN-04
must_haves:
  truths:
    - A learner anon-key SELECT against public.answer_options is rejected (REVOKE in effect) (D-08)
    - A learner anon-key SELECT against public.answer_options_public returns rows with exactly the four pinned columns (id, question_id, option_text, sort_order) and no is_correct field (D-07)
    - The view is created with `security_invoker = off` (definer mode) so revoking the underlying table from `authenticated` does not also break the view (D-07)
    - The learner lesson page reads from answer_options_public, not the underlying table (D-09)
    - The admin lesson edit page continues to read the underlying table directly (D-09)
    - submitQuizAttempt fetches the questions+answer_options join via createAdminClient (service-role bypasses RLS) so scoring still works (D-10)
    - The admin lesson edit page (src/app/(dashboard)/admin/lessons/[lessonId]/edit/page.tsx) continues to read is_correct via the existing admin RLS policy on the underlying table; unchanged by this plan
    - scoreQuizAttempt in src/lib/quizzes/score.ts is not modified (D-10)
  artifacts:
    - path: supabase/migrations/008_answer_options_public_view.sql
      provides: Definer-mode view answer_options_public with pinned columns; REVOKE on the underlying table from authenticated; learner SELECT policy on the table dropped; admin policy preserved
      contains: "create or replace view public.answer_options_public"
    - path: src/app/(dashboard)/lessons/[lessonId]/page.tsx
      provides: Learner lesson read switched from answer_options to answer_options_public
      contains: "answer_options_public"
    - path: src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts
      provides: submitQuizAttempt uses createAdminClient for the questions/answer_options scoring fetch only (per D-10); other queries stay on learner client
      contains: "createAdminClient"
    - path: src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts
      provides: Vitest unit asserting submitQuizAttempt acquires the admin client before fetching questions, and that scoring works against the existing scoreQuizAttempt
    - path: src/app/(dashboard)/lessons/[lessonId]/answer-options-isolation.integration.test.ts
      provides: Vitest integration asserting an anon-key SELECT on answer_options is denied AND an anon-key SELECT on answer_options_public returns the four columns without is_correct
  key_links:
    - from: src/app/(dashboard)/lessons/[lessonId]/page.tsx
      to: public.answer_options_public (view)
      via: supabase.from("answer_options_public").select(...)
      pattern: "answer_options_public"
    - from: src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts
      to: src/lib/supabase/admin.ts
      via: createAdminClient bypasses RLS for the scoring fetch
      pattern: "createAdminClient"
    - from: supabase/migrations/008_answer_options_public_view.sql
      to: public.answer_options
      via: REVOKE select FROM authenticated; existing answer_options_admin_all policy preserved
      pattern: "revoke select on public.answer_options from authenticated"
---

<objective>
Close HARDEN-04: hide the `is_correct` flag from learner anon-key SELECTs by introducing a definer-mode view `public.answer_options_public` that exposes only the four pinned columns, REVOKE'ing direct table read from the `authenticated` role, and rewriting the learner lesson page + quiz scoring action to use the new boundaries.

Purpose: Today, any learner with the public anon key can query `answer_options.is_correct` directly even though application code never selects it for rendering. CONCERNS.md and REQUIREMENTS.md require RLS-level isolation. Per D-07 the view runs in `security_invoker = off` (definer) mode so the REVOKE on the underlying table does not block view-driven reads. Per D-08 the underlying table's `authenticated` SELECT is revoked. Per D-09 the learner lesson page reads the view; admin pages keep reading the table directly through the existing admin policy. Per D-10 only the `is_correct`-bearing scoring fetch in `submitQuizAttempt` switches to the service-role client; all other queries in that action stay on the learner client. `scoreQuizAttempt` is unchanged.

Output:
- `supabase/migrations/008_answer_options_public_view.sql` creates the view, drops the learner SELECT policy on the table, GRANT'S the view to `authenticated`, and REVOKE'S the table from `authenticated`.
- The migration is pushed to the live Supabase project via `supabase db push` so the integration test exercises the real boundary.
- `src/app/(dashboard)/lessons/[lessonId]/page.tsx` reads from `answer_options_public` using the two-query in-process join shape (Path 1 in PATTERNS.md — avoids the PostgREST embedded-FK surprise).
- `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts` swaps the `is_correct` fetch to `createAdminClient`. Other queries unchanged.
- A Vitest unit covers the admin-client acquisition and the call ordering.
- A Vitest integration test asserts the RLS boundary against the real Supabase project (anon key denied on the table; anon key allowed on the view, no `is_correct` field).
- Failing-tests commit lands first; implementation, db push, and verification follow.
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
@supabase/migrations/001_initial_schema.sql
@supabase/migrations/003_rls_policies.sql
@supabase/migrations/004_indexes.sql
@src/app/(dashboard)/lessons/[lessonId]/page.tsx
@src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts
@src/lib/quizzes/score.ts
@src/lib/supabase/admin.ts
@src/app/(dashboard)/admin/lessons/[lessonId]/edit/page.tsx

<interfaces>
<!-- Contracts the executor needs without exploring. -->

Existing learner lesson query (verbatim from src/app/(dashboard)/lessons/[lessonId]/page.tsx lines 222-234):
```typescript
// Explicitly do NOT select is_correct so it never reaches the browser.
supabase
  .from("questions")
  .select(
    `
    id,
    question_text,
    question_type,
    sort_order,
    answer_options ( id, option_text, sort_order )
  `,
  )
  .eq("quiz_id", quizId)
  .order("sort_order"),
```

Replacement (PATTERNS.md Path 1 — two-query in-process join):
```typescript
const [{ data: rawQuestions }, { data: rawOptions }] = await Promise.all([
  supabase
    .from("questions")
    .select("id, question_text, question_type, sort_order")
    .eq("quiz_id", quizId)
    .order("sort_order"),
  supabase
    .from("answer_options_public")
    .select("id, question_id, option_text, sort_order")
    .order("sort_order"),
]);
// Group options by question_id and stitch into the existing rendering shape.
```

Existing scoring query (verbatim from src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts lines 80-95):
```typescript
const { data: rawQuestions, error: qErr } = await supabase
  .from("questions")
  .select(
    `
    id,
    question_type,
    points,
    sort_order,
    answer_options (
      id,
      is_correct
    )
  `,
  )
  .eq("quiz_id", input.quizId)
  .order("sort_order");
```

Replacement (PATTERNS.md "src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts — HARDEN-04"):
```typescript
let admin;
try {
  admin = createAdminClient();
} catch (e) {
  const message = e instanceof Error ? e.message : "Admin client unavailable.";
  return { ok: false, error: message };
}

// HARDEN-04: is_correct is RLS-revoked from learner sessions, so the scoring
// fetch uses the service-role client. Eligibility checks above already ran
// against the learner's session.
const { data: rawQuestions, error: qErr } = await admin
  .from("questions")
  .select(
    `
    id,
    question_type,
    points,
    sort_order,
    answer_options (
      id,
      is_correct
    )
  `,
  )
  .eq("quiz_id", input.quizId)
  .order("sort_order");
if (qErr || !rawQuestions) {
  return { ok: false, error: qErr?.message ?? "Questions not found." };
}
```

Migration DDL (verbatim per D-07/D-08):
```sql
-- BMH Institute: answer_options public view (HARDEN-04)
-- Hides is_correct from learner sessions. Admin policy on the underlying
-- table is preserved for the lesson editor; service-role bypass is
-- preserved for server-side scoring (createAdminClient).

create or replace view public.answer_options_public
  with (security_invoker = off) as
  select id, question_id, option_text, sort_order
  from public.answer_options;

drop policy if exists answer_options_learner_read on public.answer_options;

grant select on public.answer_options_public to authenticated;
revoke select on public.answer_options from authenticated;

-- Admin/owner sessions still read the underlying table via the existing
-- answer_options_admin_all policy (003_rls_policies.sql:175-177).
-- Service-role keys (createAdminClient) bypass RLS entirely and continue
-- to read is_correct for scoring in submitQuizAttempt.
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Test inventory review</name>
  <files>(no files written; reviewable contract)</files>
  <read_first>
    - .planning/phases/01-auth-and-access-hardening/01-CONTEXT.md (D-07, D-08, D-09, D-10)
    - .planning/phases/01-auth-and-access-hardening/01-PATTERNS.md (sections "supabase/migrations/009_answer_options_public_view.sql" — note the executable filename here is `008_*.sql` because plan 1-3 dropped its 008 migration per D-05; "src/app/(dashboard)/lessons/[lessonId]/page.tsx" and "src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts")
    - .planning/codebase/TESTING.md (sections "Mocking" and "Integration Tests")
    - supabase/migrations/003_rls_policies.sql lines 162-177 (the policy being modified)
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/page.tsx (verify it reads is_correct via the admin client — must continue to work after the REVOKE)
  </read_first>
  <action>
Enumerate the failing test inventory for HARDEN-04. Per REQUIREMENTS.md the regression must "assert that a learner anon-key query returns no `is_correct` field". This requires a real Supabase boundary — only an integration test against the live RLS surface can verify the REVOKE.

Inventory:

File A — `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts` (Vitest unit; new file, runs in `npm run test`)

`describe("submitQuizAttempt (HARDEN-04 admin-client scoring fetch)")`:

1. `it("acquires createAdminClient before fetching questions for scoring")` — Mock `@/lib/supabase/server` (`createClient`) and `@/lib/supabase/admin` (`createAdminClient`). Stub the eligibility-check chain on the learner client; stub the questions+answer_options chain on the admin client to return one question with one correct option. Stub the `user_quiz_attempts` insert on the learner client. Submit a passing answer set; assert the admin client was acquired and the questions/answer_options select was called on it (not on the learner client).

2. `it("returns the admin-client error when env vars are missing")` — `createAdminClient` throws. Assert result is `{ ok: false, error: "Service role key missing" }` (or whatever `createAdminClient` throws verbatim — match the existing pattern from PATTERNS.md). The eligibility queries on the learner client still resolve cleanly.

3. `it("preserves the existing scoring contract: a fully-correct submission scores 100%")` — Build a single-question quiz with one correct option in the admin-client mock. Submit the correct option id. Assert the inserted `user_quiz_attempts` row has `score = 100` (or whatever the existing scoreQuizAttempt invariant is — read score.test.ts to confirm the scale). This is the regression-safety case for D-10's "scoring logic unchanged".

That is three `it` cases for the unit. They cover the boundary change without testing every existing branch (eligibility, multi-question scoring, etc. are covered indirectly by the existing score.test.ts — out of scope here).

Note on file existence: `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts` does NOT currently exist (no test colocated with the action per TESTING.md "Test Coverage Gaps"). This plan creates it.

File B — `src/app/(dashboard)/lessons/[lessonId]/answer-options-isolation.integration.test.ts` (Vitest integration; runs in `npm run test:integration` only)

This is the second integration test in the codebase (after plan 1-3's). Reuses the throwaway-user pattern.

`describe("answer_options isolation (HARDEN-04)")`:

1. `it("denies a learner anon-key SELECT on public.answer_options", { timeout: 30_000 })`
   - Setup: create a throwaway user with `email_confirm: true`. Sign in via the anon-key client to get a real learner session with a JWT (NOT the service role). Pick any existing `answer_options.id` from the project (read one row via the service-role admin client up front so we know an id to query for).
   - Action: with the learner-session client, call `learner.from("answer_options").select("*").limit(1)`.
   - Assert: either `error` is non-null (RLS denial) OR `data` is an empty array (RLS filter returned no rows). Both shapes are acceptable Supabase responses to a denied SELECT after the REVOKE; the contract is "the learner cannot read `is_correct`".
   - Cleanup: delete the throwaway user via the admin client in `finally`.

2. `it("allows a learner anon-key SELECT on public.answer_options_public and returns no is_correct field", { timeout: 30_000 })`
   - Setup: same throwaway-user shape. Find an existing `answer_options.question_id` value via the admin client.
   - Action: with the learner-session client, call `learner.from("answer_options_public").select("*").eq("question_id", knownQuestionId).limit(1)`.
   - Assert:
     - `error` is null
     - `data.length` is >= 0 (rows may or may not be visible depending on the underlying RLS — but the QUERY ITSELF must be authorised; the GRANT to `authenticated` on the view is what we're verifying)
     - For each row in `data`, `Object.keys(row)` is exactly `["id", "question_id", "option_text", "sort_order"]` — no `is_correct`. (Use `expect(Object.keys(row).sort()).toEqual(["id", "option_text", "question_id", "sort_order"])`.)
   - Cleanup: delete throwaway user.

3. `it("preserves admin SELECT on public.answer_options including is_correct", { timeout: 30_000 })`
   - Setup: use the service-role admin client only (no throwaway user — the service role bypasses RLS by definition).
   - Action: `admin.from("answer_options").select("id, is_correct").limit(1)`.
   - Assert: `error` is null and `data` is an array (length 0 or 1). The shape contains `is_correct`. This pins the contract that the REVOKE didn't break service-role reads, which `submitQuizAttempt` and the admin lesson editor rely on.

That is three `it` cases for the integration suite.

Out of scope for this plan:
- Playwright e2e of the quiz submission flow (TEST-03 in Phase 4)
- Type generation against the new view (TYPE-01 in Phase 4)
- A test that exercises the admin lesson edit page reading `is_correct` via the admin RLS policy — that path is unchanged by this plan and an integration test for it would belong to TEST-02 in Phase 4

This inventory is the contract.
  </action>
  <verify>
    <automated>echo "Test inventory enumerated; awaiting reviewer ack."</automated>
  </verify>
  <acceptance_criteria>
    - Task summary lists 2 test files and 6 total `it` cases (3 unit + 3 integration)
    - Each `it` description names what it asserts
    - The integration suite reuses the throwaway-user pattern from plan 1-3 and documents this in a header comment
    - The "shape contract" assertion (`Object.keys(row).sort()` exactly equals the four pinned columns) is named verbatim
  </acceptance_criteria>
  <done>The inventory is the single contract for the failing-tests commit.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Write failing tests and commit</name>
  <files>
    - src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts
    - src/app/(dashboard)/lessons/[lessonId]/answer-options-isolation.integration.test.ts
  </files>
  <read_first>
    - src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts (the file under test — read the full file to understand the eligibility checks, the questions select, and the user_quiz_attempts insert)
    - src/lib/quizzes/score.ts (the pure scoring function — confirm its return shape for the regression assertion)
    - src/lib/quizzes/score.test.ts (style reference for fixture construction)
    - src/lib/supabase/admin.ts (the createAdminClient factory being mocked)
    - vitest.integration.config.ts (env loading; this is the second integration file — pattern is settled by plan 1-3)
    - .planning/phases/01-auth-and-access-hardening/01-3-user-deletion-PLAN.md (if available — reuse the throwaway-user pattern from its integration test)
  </read_first>
  <behavior>
    - Unit Test 1: `createAdminClient` is acquired before the questions select; the select runs on the admin client, not the learner client
    - Unit Test 2: `createAdminClient` throwing surfaces the error verbatim
    - Unit Test 3: a fully-correct submission scores 100% (regression-safety for D-10)
    - Integration Test 1: learner anon-key SELECT on `public.answer_options` is denied or returns empty
    - Integration Test 2: learner anon-key SELECT on `public.answer_options_public` succeeds and rows expose only the four pinned columns
    - Integration Test 3: service-role SELECT on `public.answer_options` still returns rows including `is_correct`
    - All six cases fail at this commit because the migration is not yet applied AND the action still uses the learner client for the scoring fetch
  </behavior>
  <action>
File A — `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts`

Header:
```typescript
// HARDEN-04: regression that submitQuizAttempt acquires createAdminClient
// for the questions/answer_options scoring fetch (per D-10). Eligibility
// queries continue to run against the learner client.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

Mocks:

The action does multiple Supabase calls. Read the file to enumerate them. At minimum:
- `auth.getUser()` on the learner client (eligibility entry)
- `from("quizzes").select(...).eq(...).maybeSingle()` on the learner client (quiz lookup at lines ~35-39)
- `from("user_quiz_attempts").select(...).eq(...)` on the learner client (attempts lookup at lines ~47-50)
- `from("questions").select(...).eq(...).order(...)` — THIS is the one that switches to the admin client per D-10
- `from("user_quiz_attempts").insert(...)` on the learner client (attempt insert at lines ~116-129)

Build two separate mock chains, one for the learner client and one for the admin client. Use a flag to record which client received each `from()` call so the call-order test can assert the boundary:

```typescript
const learnerFromCalls: string[] = [];
const adminFromCalls: string[] = [];
let questionsRows: Array<{
  id: string;
  question_type: string;
  points: number;
  sort_order: number;
  answer_options: Array<{ id: string; is_correct: boolean }>;
}> = [];
let attemptInsertSpy = vi.fn(async () => ({ data: null, error: null }));
let adminFactoryThrows: Error | null = null;
let lastInsertedAttempt: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "learner-1", email: "l@b.com" } },
        error: null,
      }),
    },
    from: (table: string) => {
      learnerFromCalls.push(table);
      if (table === "quizzes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "quiz-1",
                  pass_threshold: 80,
                  max_attempts: 3,
                  retake_cooldown_hours: 0,
                  lesson_id: "lesson-1",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user_quiz_attempts") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  then: (r: (v: { data: unknown[]; error: null }) => unknown) =>
                    Promise.resolve({ data: [], error: null }).then(r),
                }),
              }),
            }),
          }),
          insert: async (rows: Record<string, unknown>) => {
            lastInsertedAttempt = rows as Record<string, unknown>;
            await attemptInsertSpy(rows);
            return { data: null, error: null };
          },
        };
      }
      throw new Error(`Unexpected learner-client table ${table}`);
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    if (adminFactoryThrows) throw adminFactoryThrows;
    return {
      from: (table: string) => {
        adminFromCalls.push(table);
        if (table === "questions") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({ data: questionsRows, error: null }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected admin-client table ${table}`);
      },
    };
  }),
}));

import { submitQuizAttempt } from "./quiz-actions";
```

Cases:

```typescript
describe("submitQuizAttempt (HARDEN-04 admin-client scoring fetch)", () => {
  beforeEach(() => {
    learnerFromCalls.length = 0;
    adminFromCalls.length = 0;
    adminFactoryThrows = null;
    lastInsertedAttempt = null;
    attemptInsertSpy.mockReset();
    attemptInsertSpy.mockResolvedValue({ data: null, error: null });
    questionsRows = [
      {
        id: "q-1",
        question_type: "single_choice",
        points: 10,
        sort_order: 1,
        answer_options: [
          { id: "a-1", is_correct: true },
          { id: "a-2", is_correct: false },
        ],
      },
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("acquires createAdminClient before fetching questions for scoring", async () => {
    const result = await submitQuizAttempt({
      quizId: "quiz-1",
      lessonId: "lesson-1",
      answers: { "q-1": ["a-1"] },
    });
    expect(result).toMatchObject({ ok: true });
    expect(adminFromCalls).toContain("questions");
    expect(learnerFromCalls).not.toContain("questions");
  });

  it("returns the admin-client error when env vars are missing", async () => {
    adminFactoryThrows = new Error("Service role key missing");
    const result = await submitQuizAttempt({
      quizId: "quiz-1",
      lessonId: "lesson-1",
      answers: { "q-1": ["a-1"] },
    });
    expect(result).toEqual({ ok: false, error: "Service role key missing" });
    expect(adminFromCalls).not.toContain("questions");
  });

  it("preserves the existing scoring contract: a fully-correct submission scores 100%", async () => {
    const result = await submitQuizAttempt({
      quizId: "quiz-1",
      lessonId: "lesson-1",
      answers: { "q-1": ["a-1"] },
    });
    expect(result).toMatchObject({ ok: true });
    expect(lastInsertedAttempt?.score).toBe(100);
  });
});
```

Adjust the `submitQuizAttempt` call signature and the inserted-row shape after reading the production file (the exact arg shape and the inserted column names may differ; match the file). If the action exposes its input as a different shape, adapt the call but preserve the assertion contract.

File B — `src/app/(dashboard)/lessons/[lessonId]/answer-options-isolation.integration.test.ts`

Header:
```typescript
// HARDEN-04: integration regression for the answer_options isolation
// boundary. Asserts the REVOKE on public.answer_options and the GRANT on
// public.answer_options_public are in effect against the live Supabase
// project. Reuses the throwaway-user pattern established in
// .../[userId]/edit/actions.integration.test.ts (HARDEN-03).
import { afterAll, describe, expect, it } from "vitest";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

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

async function withThrowawayLearner<T>(
  fn: (learner: ReturnType<typeof createSbClient>, userId: string) => Promise<T>,
): Promise<T> {
  const email = `harden-04-${randomBytes(8).toString("hex")}@bmh.invalid`;
  const password = `${randomBytes(16).toString("base64url")}!Aa1`;
  let userId: string | null = null;
  try {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createErr || !created.user) throw createErr ?? new Error("create failed");
    userId = created.user.id;
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
```

Cases:
```typescript
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
          expect(Object.keys(row as Record<string, unknown>)).not.toContain(
            "is_correct",
          );
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
```

Run the unit suite to confirm red state:
```
npm run test -- src/app/\(dashboard\)/lessons/\[lessonId\]/quiz-actions
```
Expected: "acquires createAdminClient" fails (the action still uses the learner client for the questions select); "returns the admin-client error" fails (no admin client is acquired so no throw is surfaced); "preserves scoring" may pass if the action happens to score correctly via the learner client and the answer_options are accessible — that path will FAIL only after the REVOKE is in effect AND the migration is pushed. Document this in the commit body.

Run the integration suite (will require the migration applied; expected to fail before Task 4):
```
npm run test:integration -- src/app/\(dashboard\)/lessons/\[lessonId\]/answer-options-isolation
```
Expected red state: case 1 fails (no REVOKE yet, learner CAN read the table); case 2 fails (the view does not exist yet); case 3 may pass (admin client always reads).

Commit:
```
test(01-auth): HARDEN-04 failing regression for answer_options isolation

Three unit cases pinning the createAdminClient boundary in submitQuizAttempt
(D-10) and three integration cases pinning the RLS boundary on
public.answer_options vs public.answer_options_public.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run test -- src/app/\(dashboard\)/lessons/\[lessonId\]/quiz-actions 2>&1 | tee /tmp/harden-04-red-unit.log; tail -30 /tmp/harden-04-red-unit.log</automated>
  </verify>
  <acceptance_criteria>
    - Both test files exist at the paths in `<files>`
    - `npm run test -- src/app/\(dashboard\)/lessons/\[lessonId\]/quiz-actions` shows the unit suite with at least 1 failing `it` case (specifically: "acquires createAdminClient before fetching questions")
    - The commit message starts with `test(01-auth):`
    - `git log -1 --name-only` shows ONLY the two new test files
  </acceptance_criteria>
  <done>Failing tests committed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Author the migration, update the learner page, switch the scoring action, commit</name>
  <files>
    - supabase/migrations/008_answer_options_public_view.sql
    - src/app/(dashboard)/lessons/[lessonId]/page.tsx
    - src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts
  </files>
  <read_first>
    - supabase/migrations/003_rls_policies.sql lines 162-177 (the policy being dropped)
    - supabase/migrations/004_indexes.sql line 24 (the index serving the view query)
    - supabase/migrations/006_storage_content_bucket.sql (header style + GRANT/REVOKE syntax precedent — note: this is the closest analog, but storage GRANTs target a different role; treat as syntax reference only)
    - src/app/(dashboard)/lessons/[lessonId]/page.tsx (read the full file — the existing toOptionList helper at lines 376-386 is unchanged but the executor must understand how it consumes the rows so the in-process join produces the same shape)
    - src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts (read the full file — confirm where the questions select sits relative to the eligibility checks)
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/page.tsx (CONTEXT.md `## Specifics` — verify it reads is_correct via the admin client; the REVOKE must not break it)
    - .planning/phases/01-auth-and-access-hardening/01-PATTERNS.md (full sections for HARDEN-04)
  </read_first>
  <action>
**1. Create `supabase/migrations/008_answer_options_public_view.sql`**

Verbatim content (the executable migration; PATTERNS.md called this `009_*` because it assumed a separate `008_user_delete_cascade.sql`, but D-05 dropped the cascade migration so this file IS 008):

```sql
-- BMH Institute: answer_options public view (HARDEN-04)
-- Hides is_correct from learner sessions. Definer-mode view with a pinned
-- column list prevents future column leak. The admin policy on the
-- underlying table is preserved for the lesson editor; service-role bypass
-- is preserved for server-side scoring (createAdminClient).

create or replace view public.answer_options_public
  with (security_invoker = off) as
  select id, question_id, option_text, sort_order
  from public.answer_options;

drop policy if exists answer_options_learner_read on public.answer_options;

grant select on public.answer_options_public to authenticated;
revoke select on public.answer_options from authenticated;

-- Admin/owner sessions still read the underlying table via the existing
-- answer_options_admin_all policy (003_rls_policies.sql lines 175-177).
-- Service-role keys (createAdminClient) bypass RLS entirely and continue
-- to read is_correct for scoring in submitQuizAttempt.
```

Constraints:
- File name must be exactly `008_answer_options_public_view.sql` (next free slot after `007_storage_submissions_bucket.sql`; plan 1-3 ships no migration per D-05).
- Header comment uses `BMH Institute` (per the `## Claude's Discretion` note in CONTEXT.md, new migrations may use the new name).
- Use `with (security_invoker = off)` exactly — definer mode is mandatory per PATTERNS.md "Implementation note for the planner".

**2. Update `src/app/(dashboard)/lessons/[lessonId]/page.tsx`**

Replace the existing single-query `from("questions").select(...answer_options...).eq("quiz_id", quizId).order("sort_order")` block (lines 222-234) with the two-query in-process join (PATTERNS.md Path 1 — chosen to avoid the PostgREST embedded-FK cache surprise on views).

Keep this query inside the `Promise.all` block where it currently lives so other concurrent fetches don't lose parallelism. Sketch:

```typescript
// HARDEN-04: read from answer_options_public view; is_correct is not
// exposed to learner sessions. Two queries + in-process join avoids the
// PostgREST embedded-FK cache surprise on views (see PATTERNS.md Path 1).
const [
  // ...existing concurrent fetches preserved
  { data: rawQuestions },
  { data: rawOptions },
] = await Promise.all([
  // ...existing concurrent fetches preserved
  supabase
    .from("questions")
    .select("id, question_text, question_type, sort_order")
    .eq("quiz_id", quizId)
    .order("sort_order"),
  supabase
    .from("answer_options_public")
    .select("id, question_id, option_text, sort_order")
    .eq("question_id", "in_subquery_or_null")
    // The view has no FK so we cannot join in PostgREST. Pull all options
    // for the quiz's questions and group in-process.
    .order("sort_order"),
]);
```

The cleanest filter: pull options for the question_ids returned by the first query. Because both queries are parallel and the second cannot reference the first's results, the two patterns are:

- (a) Two parallel queries; second pulls EVERY answer option in the project, then filter in-process. Simple but pulls more data than needed.
- (b) Sequential: await `rawQuestions` first, then query options with `.in("question_id", questionIds)`. Loses parallelism on this pair but keeps it for other unrelated queries.

Use (b) — narrow the data pull. Adjust the surrounding code so the questions query runs in `Promise.all` with truly independent fetches, and the options query runs after questions resolve:

```typescript
// existing Promise.all stays, with the inner answer_options join replaced
// by a select of just the question scalars.
const [
  // ...other concurrent fetches preserved
  questionsResult,
] = await Promise.all([
  // ...other concurrent fetches preserved
  supabase
    .from("questions")
    .select("id, question_text, question_type, sort_order")
    .eq("quiz_id", quizId)
    .order("sort_order"),
]);
const rawQuestions = questionsResult.data;

// HARDEN-04: separate fetch from the view (no embedded join: PostgREST
// does not expose FKs through views).
const questionIds = (rawQuestions ?? []).map((q) => q.id as string);
const { data: rawOptions } = questionIds.length
  ? await supabase
      .from("answer_options_public")
      .select("id, question_id, option_text, sort_order")
      .in("question_id", questionIds)
      .order("sort_order")
  : { data: [] as Array<{ id: string; question_id: string; option_text: string; sort_order: number }> };

const optionsByQuestion = new Map<string, Array<{ id: string; option_text: string; sort_order: number }>>();
for (const opt of rawOptions ?? []) {
  const arr = optionsByQuestion.get(opt.question_id as string) ?? [];
  arr.push({
    id: opt.id as string,
    option_text: opt.option_text as string,
    sort_order: opt.sort_order as number,
  });
  optionsByQuestion.set(opt.question_id as string, arr);
}

// Where the existing code reads `q.answer_options`, replace with
// `optionsByQuestion.get(q.id as string) ?? []`.
```

Adapt this pattern to the file's actual shape — read it first to find every place that consumes `q.answer_options` and stitch in the grouped map. The `toOptionList` helper at lines 376-386 takes the array and produces the rendered list; its input shape is unchanged so no helper edit is required.

Update the inline comment (PATTERNS.md says line 220 currently says "Explicitly do NOT select is_correct so it never reaches the browser."):
```typescript
// HARDEN-04: read from answer_options_public view; is_correct is not
// exposed to learner sessions.
```

**3. Update `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts`**

Add the import (group with `@/lib/*` per CONVENTIONS.md):
```typescript
import { createAdminClient } from "@/lib/supabase/admin";
```

Find the existing block at lines 80-95 (the `from("questions").select(... answer_options ( id, is_correct )...).eq("quiz_id", input.quizId).order("sort_order")` call). Insert the createAdminClient acquisition immediately above it and switch ONLY this query to the admin client. All other queries in the file (the `quizzes` lookup at lines 35-39, the `user_quiz_attempts` lookup at lines 47-50, the `user_quiz_attempts` insert at lines 116-129) stay on `supabase` (the learner client). Do not change them.

Verbatim replacement block:

```typescript
let admin;
try {
  admin = createAdminClient();
} catch (e) {
  const message = e instanceof Error ? e.message : "Admin client unavailable.";
  return { ok: false, error: message };
}

// HARDEN-04 / D-10: is_correct is RLS-revoked from learner sessions, so the
// scoring fetch uses the service-role client. Eligibility checks above
// already ran against the learner's session.
const { data: rawQuestions, error: qErr } = await admin
  .from("questions")
  .select(
    `
    id,
    question_type,
    points,
    sort_order,
    answer_options (
      id,
      is_correct
    )
  `,
  )
  .eq("quiz_id", input.quizId)
  .order("sort_order");
if (qErr || !rawQuestions) {
  return { ok: false, error: qErr?.message ?? "Questions not found." };
}
```

Do NOT modify anything in `src/lib/quizzes/score.ts` (D-10 explicitly preserves it).
Do NOT modify the admin lesson edit page or `src/app/(dashboard)/admin/lessons/[lessonId]/edit/page.tsx` — its admin RLS policy on the underlying table is unchanged.

Run `npm run verify`. Expect:
- TypeScript passes (the view will not have generated types yet — TYPE-01 is Phase 4 — so the executor may need to add `as` assertions on the view's row fields, matching the existing assertion style in this file. This is acceptable and consistent with CONCERNS.md's "Tech Debt" note about the broader cleanup deferred to Phase 4.)
- The unit suite (excluding the new quiz-actions tests, which still depend on the migration) passes.

Run the unit suite for the action:
```
npm run test -- src/app/\(dashboard\)/lessons/\[lessonId\]/quiz-actions
```
Expect all 3 unit cases to pass (the action now uses the admin client per the test mocks).

Commit:
```
feat(01-auth): HARDEN-04 isolate is_correct via answer_options_public view

Migration 008 creates a definer-mode view with the four pinned columns,
drops the learner SELECT policy on the underlying table, GRANTs the view
to authenticated, and REVOKEs the table from authenticated. The learner
lesson page reads the view; submitQuizAttempt switches the scoring fetch
to the service-role client (D-10) so RLS-revoked is_correct stays
accessible to scoring. Admin paths and scoreQuizAttempt unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run verify 2>&1 | tail -40 && grep -c "create or replace view public.answer_options_public" supabase/migrations/008_answer_options_public_view.sql && grep -c "security_invoker = off" supabase/migrations/008_answer_options_public_view.sql && grep -c "revoke select on public.answer_options from authenticated" supabase/migrations/008_answer_options_public_view.sql && grep -c "answer_options_public" src/app/\(dashboard\)/lessons/\[lessonId\]/page.tsx && grep -c "createAdminClient" src/app/\(dashboard\)/lessons/\[lessonId\]/quiz-actions.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep "create or replace view public.answer_options_public" supabase/migrations/008_answer_options_public_view.sql` returns a match
    - `grep "security_invoker = off" supabase/migrations/008_answer_options_public_view.sql` returns a match
    - `grep "revoke select on public.answer_options from authenticated" supabase/migrations/008_answer_options_public_view.sql` returns a match
    - `grep "drop policy if exists answer_options_learner_read" supabase/migrations/008_answer_options_public_view.sql` returns a match
    - `grep "from(\"answer_options_public\")" src/app/(dashboard)/lessons/[lessonId]/page.tsx` returns a match
    - `grep "createAdminClient" src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts` returns a match
    - `npm run verify` exits 0
    - `npm run test -- src/app/\(dashboard\)/lessons/\[lessonId\]/quiz-actions` reports 3 passed
    - `git log -1 --name-only` shows the three production files (and nothing else)
  </acceptance_criteria>
  <done>Code, query, and migration in place. Schema push happens in Task 4.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: [BLOCKING] Push migration 008 to live Supabase</name>
  <files>(no source files modified)</files>
  <read_first>
    - AGENTS.md (Supabase project ref `dhvfsyteqsxagokoerrx`, label `bmh-institute`)
    - supabase/migrations/008_answer_options_public_view.sql (the file to be pushed)
  </read_first>
  <what-built>
    The migration file `supabase/migrations/008_answer_options_public_view.sql` exists locally and Task 3's code changes reference the new view. The integration test in Task 5 will exercise the live RLS boundary; it cannot pass until the migration is applied to the production project.
  </what-built>
  <action>
Per the schema-push gate in the orchestrator's <schema_push_requirement>: this is the only plan in Phase 1 that ships a migration (plan 1-3 dropped its 008 cascade migration per D-05). The push must happen AFTER the migration commit (Task 3) and BEFORE the integration verification (Task 5).

Run the push from the project root:
```bash
supabase db push
```

If the CLI prompts for project linking, link to project ref `dhvfsyteqsxagokoerrx`:
```bash
supabase link --project-ref dhvfsyteqsxagokoerrx
```

Non-TTY workaround (for headless executors): set `SUPABASE_ACCESS_TOKEN` in the environment before the push. The token is provisioned by the developer; do not attempt to mint one.

After the push, verify the boundary is in place by running a quick service-role check (read-only):
```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
c.from('answer_options_public').select('*').limit(1).then(r => console.log('view present:', r.error === null));
"
```

If the migration push fails (network, auth, drift), surface the error and STOP. Do NOT attempt a destructive workaround. Manual options:
- Apply the migration via the Supabase dashboard SQL editor (paste the contents of `008_answer_options_public_view.sql`)
- Resolve the underlying CLI auth issue, then retry
  </action>
  <how-to-verify>
    1. Confirm `supabase db push` exited 0
    2. Confirm a service-role SELECT on `public.answer_options_public` returns rows or empty array (not an error about the view not existing)
    3. Confirm an anon-key SELECT on `public.answer_options` is denied or returns empty
    4. Reply `approved` once the boundary is in place
  </how-to-verify>
  <resume-signal>Type "approved" once `supabase db push` has succeeded and the boundary verifies, or describe the failure for course correction.</resume-signal>
  <verify>
    <automated>echo "Migration push is human-gated; verify message awaited."</automated>
  </verify>
  <acceptance_criteria>
    - The user replies `approved`
    - The integration test in Task 5 can connect to the live project and observes the view
  </acceptance_criteria>
  <done>The migration is live; the integration test in Task 5 will exercise real boundaries.</done>
</task>

<task type="auto">
  <name>Task 5: Run integration suite and confirm phase verification green</name>
  <files>(no source files modified; verification only)</files>
  <read_first>
    - .env.test.local (confirm SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are populated)
    - src/app/(dashboard)/lessons/[lessonId]/answer-options-isolation.integration.test.ts (the test being run)
  </read_first>
  <action>
After the migration is live (Task 4 approved), run the integration suite:

```bash
npm run test:integration -- src/app/\(dashboard\)/lessons/\[lessonId\]/answer-options-isolation
```

Expected: all 3 cases pass.

Run the full unit + typecheck suite to confirm no regressions:
```bash
npm run verify
```

Expected: green.

Run plan 1-3's integration test as a co-living-companion check (it should still pass — the throwaway-user pattern is shared):
```bash
npm run test:integration -- src/app/\(dashboard\)/admin/users/\[userId\]/edit/actions.integration.test.ts
```

Expected: green (assuming plan 1-3 has been executed).

If any of these fail, surface the failure clearly with the full output. Do NOT attempt to amend the migration — return to the developer for course correction.
  </action>
  <verify>
    <automated>npm run test:integration -- src/app/\(dashboard\)/lessons/\[lessonId\]/answer-options-isolation 2>&1 | tail -30; npm run verify 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - The integration suite reports 3 passed for `answer-options-isolation.integration.test.ts`
    - `npm run verify` exits 0
    - No regressions in the unit suite
  </acceptance_criteria>
  <done>HARDEN-04 closed: live RLS boundary verified end-to-end against the production Supabase project.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → public anon-key Supabase API | Untrusted learner can issue any SELECT against any table they have RLS access to. |
| Server action → service-role Supabase API | Service role bypasses RLS; only callable from server-side code with the secret key. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-4-01 | Information Disclosure | `public.answer_options.is_correct` exposed via anon-key SELECT | mitigate | Migration 008 REVOKEs SELECT from `authenticated`; the new view exposes only the four pinned columns. Integration tests pin both halves. |
| T-01-4-02 | Tampering | Future column added to `public.answer_options` leaks through the view | mitigate | The view's SELECT list is pinned to `id, question_id, option_text, sort_order`. Any new column is excluded by default. The integration test asserts row keys exactly equal those four. |
| T-01-4-03 | Spoofing | Learner forges a quiz submission and the scoring path can no longer fetch `is_correct` | mitigate | `submitQuizAttempt` switches the scoring read to `createAdminClient` (service role bypasses RLS). Eligibility checks above the scoring read remain on the learner client so identity is still verified. Unit Test 1 pins this boundary. |
| T-01-4-04 | Elevation of Privilege | Definer-mode view runs as the view owner; could expose more than intended | accept | Pinned column list mitigates the risk. Future migrations adding columns must explicitly extend the view's SELECT list; the column-shape integration test will fail loudly if a column is leaked. Severity low. |
| T-01-4-05 | Denial of Service | The admin lesson editor breaks because the REVOKE blocks its `is_correct` read | mitigate | The existing `answer_options_admin_all` policy (003_rls_policies.sql lines 175-177) is preserved. Admin sessions continue to read the underlying table directly. Manual smoke recommended on first deploy of plan 1-4. |

threat_model:
  threats_mitigated:
    - id: T-01-4-01
      description: Anon-key learner reads is_correct directly from the table to defeat quiz scoring
      severity: high
      mitigation: Migration 008 REVOKEs table SELECT from authenticated; learner reads the view; integration suite asserts both halves of the boundary.
    - id: T-01-4-02
      description: Future column on answer_options leaks via the view
      severity: medium
      mitigation: Pinned SELECT list in the view; integration test asserts the row shape exactly.
    - id: T-01-4-03
      description: Scoring path loses access to is_correct after the REVOKE
      severity: high
      mitigation: submitQuizAttempt switches the scoring fetch to createAdminClient (D-10); unit test pins the call boundary.
  residual_risk:
    - description: TYPE-01 (Phase 4) generates Supabase types from the live schema; until then, queries against the new view rely on `as` assertions consistent with the rest of the codebase. Severity low.
    - description: An accidental future migration that re-grants table SELECT to authenticated would silently re-open the boundary. Mitigated by the integration tests (CI / pre-deploy run catches the regression). Severity low.
  asvs_mapping: V4.1 (General Access Control Design), V8.1 (General Data Protection), V13.1 (Generic Web Service Security)
</threat_model>

<verification>
- `npm run verify` exits 0 (post-Task 3)
- `npm run test -- src/app/\(dashboard\)/lessons/\[lessonId\]/quiz-actions` reports 3 passed (post-Task 3)
- `npm run test:integration -- src/app/\(dashboard\)/lessons/\[lessonId\]/answer-options-isolation` reports 3 passed (post-Task 5; requires Task 4 approval)
- All grep checks in Task 3's `<acceptance_criteria>` pass
- Two distinct commits in `git log`: a `test(01-auth):` commit then a `feat(01-auth):` commit
- Manual smoke on first deploy: confirm the admin lesson edit page still renders quiz answer options with the `is_correct` toggle (the admin RLS policy preserved by this plan should keep this working — explicit smoke check is documented in the SUMMARY.md)
</verification>

<success_criteria>
- HARDEN-04 acceptance criterion met: a learner anon-key query for `answer_options` is denied AND the corresponding query against `answer_options_public` returns no `is_correct` field. Both halves of the contract are pinned by the integration suite.
- The scoring path still works (D-10 preserved): `submitQuizAttempt` uses the service-role client only for the `is_correct`-bearing query; `scoreQuizAttempt` is unchanged.
- The admin lesson edit page continues to read `is_correct` via the existing admin RLS policy on the underlying table.
- The migration ships as `008_answer_options_public_view.sql` (next free slot; D-05 dropped the `008_user_delete_cascade.sql` previously hinted at in PATTERNS.md).
- Failing-tests commit precedes implementation commit; schema push gates the integration verification.
</success_criteria>

<output>
After completion, create `.planning/phases/01-auth-and-access-hardening/01-4-SUMMARY.md` summarising:
- HARDEN-04 closed; view `public.answer_options_public` live; learner page + scoring action updated
- Migration 008 pushed to project ref `dhvfsyteqsxagokoerrx`
- Commit shas for test + impl commits + migration commit (or note that migration is part of impl commit)
- Confirmation that `npm run verify` is green AND that both integration suites pass
- Recommended manual smoke: admin lesson edit page renders the quiz with the `is_correct` toggle (post-deploy)
</output>
