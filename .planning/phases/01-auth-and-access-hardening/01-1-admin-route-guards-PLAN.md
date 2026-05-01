---
phase: 01-auth-and-access-hardening
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(dashboard)/admin/reports/page.tsx
  - src/app/(dashboard)/admin/reports/users/[userId]/page.tsx
  - src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx
  - src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx
  - src/app/(dashboard)/admin/reports/page.test.ts
  - src/app/(dashboard)/admin/reports/users/[userId]/page.test.ts
  - src/app/(dashboard)/admin/reports/courses/[courseId]/page.test.ts
  - src/app/(dashboard)/admin/reports/programs/[programId]/page.test.ts
autonomous: true
requirements:
  - HARDEN-01
must_haves:
  truths:
    - A learner who navigates directly to /admin/reports is redirected to /dashboard before any Supabase data is fetched
    - A learner who navigates directly to /admin/reports/users/{userId} is redirected to /dashboard
    - A learner who navigates directly to /admin/reports/courses/{courseId} is redirected to /dashboard
    - A learner who navigates directly to /admin/reports/programs/{programId} is redirected to /dashboard
    - An unauthenticated request to any of the four report routes is redirected to /login
    - Each report page calls await requireAdmin() as the first statement of its async default export, before any params are awaited or any Supabase client is created
  artifacts:
    - path: src/app/(dashboard)/admin/reports/page.tsx
      provides: Admin reports overview with requireAdmin guard
      contains: "await requireAdmin()"
    - path: src/app/(dashboard)/admin/reports/users/[userId]/page.tsx
      provides: User report with requireAdmin guard
      contains: "await requireAdmin()"
    - path: src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx
      provides: Course report with requireAdmin guard
      contains: "await requireAdmin()"
    - path: src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx
      provides: Program report with requireAdmin guard
      contains: "await requireAdmin()"
    - path: src/app/(dashboard)/admin/reports/page.test.ts
      provides: Vitest unit asserting requireAdmin is invoked before any data fetch on the overview report page
    - path: src/app/(dashboard)/admin/reports/users/[userId]/page.test.ts
      provides: Vitest unit asserting requireAdmin is invoked before any data fetch on the user report page
    - path: src/app/(dashboard)/admin/reports/courses/[courseId]/page.test.ts
      provides: Vitest unit asserting requireAdmin is invoked before any data fetch on the course report page
    - path: src/app/(dashboard)/admin/reports/programs/[programId]/page.test.ts
      provides: Vitest unit asserting requireAdmin is invoked before any data fetch on the program report page
  key_links:
    - from: src/app/(dashboard)/admin/reports/page.tsx
      to: src/lib/auth/guard.ts
      via: import { requireAdmin } from "@/lib/auth/guard"
      pattern: "requireAdmin"
    - from: src/app/(dashboard)/admin/reports/users/[userId]/page.tsx
      to: src/lib/auth/guard.ts
      via: import { requireAdmin } from "@/lib/auth/guard"
      pattern: "requireAdmin"
    - from: src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx
      to: src/lib/auth/guard.ts
      via: import { requireAdmin } from "@/lib/auth/guard"
      pattern: "requireAdmin"
    - from: src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx
      to: src/lib/auth/guard.ts
      via: import { requireAdmin } from "@/lib/auth/guard"
      pattern: "requireAdmin"
---

<objective>
Close HARDEN-01: every admin report page calls `requireAdmin()` as its first statement so direct navigation cannot reach admin data through a learner session.

Purpose: The four report pages currently rely entirely on `(dashboard)/admin/layout.tsx`'s guard plus RLS-as-defense-in-depth. CONCERNS.md flags this as the primary admin-data exposure surface. Adding the guard at the page level matches the codebase convention ("first line of every admin page function", per STRUCTURE.md "Where to Add New Code").

Output:
- The four report pages each call `await requireAdmin()` before awaiting params and before creating any Supabase client.
- A co-located Vitest unit per page asserting that `requireAdmin` is invoked before the page's Supabase client is created (regression coverage required by REQUIREMENTS.md HARDEN-01).
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
@src/lib/auth/guard.ts
@src/app/(dashboard)/admin/layout.tsx
@src/app/(dashboard)/admin/reports/page.tsx
@src/app/(dashboard)/admin/reports/users/[userId]/page.tsx
@src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx
@src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx

<interfaces>
<!-- Key contracts. Executor uses these directly without exploring. -->

From src/lib/auth/guard.ts (canonical guard, lines 31-38):
```typescript
export async function requireAdmin(): Promise<AuthedProfile> {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login");
  if (profile.system_role !== "owner" && profile.system_role !== "admin") {
    redirect("/dashboard");
  }
  return profile;
}
```

`redirect` is `import { redirect } from "next/navigation"`. It throws a `NEXT_REDIRECT` error that Vitest can catch.

From src/app/(dashboard)/admin/layout.tsx (canonical call site to copy):
```typescript
await requireAdmin();
```
First line of the async function body.

Param page shape (verbatim from PATTERNS.md):
```typescript
export default async function UserReportPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const supabase = await createClient();
  // ...existing body unchanged
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Test inventory review</name>
  <files>(no files written; this is the reviewable contract for what the failing-tests commit must contain)</files>
  <read_first>
    - .planning/phases/01-auth-and-access-hardening/01-CONTEXT.md
    - .planning/phases/01-auth-and-access-hardening/01-PATTERNS.md (sections "Pattern Assignments → src/app/(dashboard)/admin/reports/**/page.tsx" and "Test File Co-Location")
    - .planning/codebase/TESTING.md (sections "Mocking" and "Test Structure")
    - src/lib/quizzes/score.test.ts (analog: pure-function unit test using `vi.mock` is NOT used — but this plan REQUIRES `vi.mock` of `@/lib/auth/guard`; document that this is the first such use)
  </read_first>
  <action>
Enumerate the failing test inventory required by AGENTS.md "Test-first with inventory review". Per HARDEN-01 acceptance criterion, the regression must assert "a learner-session fetch returns 403 or redirects to /login". Per PATTERNS.md, the codebase pattern is `redirect()` (which throws `NEXT_REDIRECT` from Next.js) — do not invent a 403 response.

Output the inventory as a markdown block in your task summary so a human reviewer can sign off before any code is written. The inventory below is the fixed contract for this plan.

Inventory (4 unit tests, one per page):

1. `src/app/(dashboard)/admin/reports/page.test.ts`
   - `describe("AdminReportsPage")`
   - `it("calls requireAdmin before creating a Supabase client")` — mock `@/lib/auth/guard` so `requireAdmin` records its call order; mock `@/lib/supabase/server` so `createClient` records its call order; render the default export; assert `requireAdmin` was invoked and that its call timestamp precedes `createClient`. The test asserts call order, not implementation detail.
   - `it("redirects unauthenticated requests to /login")` — make `requireAdmin` throw the error shape Next.js throws on `redirect("/login")` (i.e. an Error with `digest` starting with `NEXT_REDIRECT`); call the page; assert the thrown error's digest is `NEXT_REDIRECT;replace;/login;307;`. (Per Next.js, `redirect()` throws an internal error; Vitest catches it cleanly.)
   - `it("redirects learner-role sessions to /dashboard")` — make `requireAdmin` throw a `NEXT_REDIRECT;replace;/dashboard;307;` digest; call the page; assert the thrown digest is `NEXT_REDIRECT;replace;/dashboard;307;`.

2. `src/app/(dashboard)/admin/reports/users/[userId]/page.test.ts`
   - Same three `it` cases as above. The "calls requireAdmin before…" case must also assert that `params` is NOT awaited before `requireAdmin` resolves (the param-page pattern in PATTERNS.md puts `await requireAdmin()` before `await params`).

3. `src/app/(dashboard)/admin/reports/courses/[courseId]/page.test.ts` — same shape.

4. `src/app/(dashboard)/admin/reports/programs/[programId]/page.test.ts` — same shape.

Mocking strategy (this is the FIRST use of `vi.mock` in the codebase per TESTING.md "No mocking framework used"; document this in the test file header comment):
```typescript
// First codebase use of vi.mock. requireAdmin and createClient have side
// effects (redirect, network) that prevent direct invocation in a unit test.
// We mock them at module level to assert call order and divergent behaviour
// (auth pass / login redirect / dashboard redirect).
```

Use `vi.mock("@/lib/auth/guard", ...)` and `vi.mock("@/lib/supabase/server", ...)`. Stub `createClient` to return an object whose `.from(...)` returns a chainable thenable that resolves to `{ data: [], error: null }` so the page body executes without error in the auth-pass case.

For the digest match approach, build the redirect error like Next.js does:
```typescript
function makeRedirectError(path: string) {
  const e = new Error("NEXT_REDIRECT");
  (e as Error & { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;`;
  return e;
}
```

This inventory is the contract. The failing-tests task creates exactly these 12 `it` cases (4 files × 3 cases) and no others.
  </action>
  <verify>
    <automated>echo "Test inventory enumerated in task summary; awaiting reviewer ack before writing tests."</automated>
  </verify>
  <acceptance_criteria>
    - Task summary lists 4 test files and 12 total `it` cases
    - Each `it` description names what it asserts
    - The mocking strategy explicitly documents that this is the first `vi.mock` use in the codebase
    - The redirect-error-digest helper is shown verbatim
  </acceptance_criteria>
  <done>The inventory is a complete, single-source contract for the failing-tests commit. No additional test cases are added later without updating this inventory.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Write failing tests and commit</name>
  <files>
    - src/app/(dashboard)/admin/reports/page.test.ts
    - src/app/(dashboard)/admin/reports/users/[userId]/page.test.ts
    - src/app/(dashboard)/admin/reports/courses/[courseId]/page.test.ts
    - src/app/(dashboard)/admin/reports/programs/[programId]/page.test.ts
  </files>
  <read_first>
    - src/app/(dashboard)/admin/reports/page.tsx (the file under test — must understand its existing imports and default export shape)
    - src/app/(dashboard)/admin/reports/users/[userId]/page.tsx
    - src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx
    - src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx
    - src/lib/auth/guard.ts (lines 31-38 — the function being mocked)
    - src/lib/supabase/server.ts (the createClient factory being mocked)
    - src/lib/quizzes/score.test.ts (style reference for `describe`/`it` naming)
    - src/lib/courses/shape.test.ts (style reference for module-level imports)
  </read_first>
  <behavior>
    - Test 1 (per file): `requireAdmin` is called and resolves before `createClient` is called
    - Test 2 (per file): unauthenticated → throws redirect error with digest containing `NEXT_REDIRECT;replace;/login;307;`
    - Test 3 (per file): learner role → throws redirect error with digest containing `NEXT_REDIRECT;replace;/dashboard;307;`
    - Tests fail at this commit because the production pages do not yet call `requireAdmin()`
  </behavior>
  <action>
Create the four test files exactly as specified in Task 1's inventory. File header comment on every file:

```typescript
// HARDEN-01: regression that the page calls requireAdmin() before any data
// fetch. First codebase use of vi.mock. requireAdmin and createClient have
// side effects (redirect, network) that prevent direct invocation.
```

Test file template (adapt per page file path / param shape):

```typescript
// HARDEN-01: regression that the page calls requireAdmin() before any data
// fetch. First codebase use of vi.mock. requireAdmin and createClient have
// side effects (redirect, network) that prevent direct invocation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => {
    calls.push("requireAdmin");
    return { id: "admin-1", email: "a@b.com", system_role: "admin" };
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    calls.push("createClient");
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (r: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(r),
    };
    return {
      from: () => chain,
      auth: { getUser: async () => ({ data: { user: null } }) },
    };
  }),
}));

import { requireAdmin } from "@/lib/auth/guard";
import AdminReportsPage from "./page";

function makeRedirectError(path: string) {
  const e = new Error("NEXT_REDIRECT");
  (e as Error & { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;`;
  return e;
}

describe("AdminReportsPage", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.mocked(requireAdmin).mockReset();
    vi.mocked(requireAdmin).mockImplementation(async () => {
      calls.push("requireAdmin");
      return { id: "admin-1", email: "a@b.com", system_role: "admin" };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls requireAdmin before creating a Supabase client", async () => {
    await AdminReportsPage();
    expect(calls[0]).toBe("requireAdmin");
    expect(calls).toContain("createClient");
    expect(calls.indexOf("requireAdmin")).toBeLessThan(calls.indexOf("createClient"));
  });

  it("redirects unauthenticated requests to /login", async () => {
    vi.mocked(requireAdmin).mockImplementation(async () => {
      throw makeRedirectError("/login");
    });
    await expect(AdminReportsPage()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT;replace;/login;307;"),
    });
  });

  it("redirects learner-role sessions to /dashboard", async () => {
    vi.mocked(requireAdmin).mockImplementation(async () => {
      throw makeRedirectError("/dashboard");
    });
    await expect(AdminReportsPage()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT;replace;/dashboard;307;"),
    });
  });
});
```

For the three param pages, change the import (`UserReportPage`, `CourseReportPage`, `ProgramReportPage`) and pass the appropriate params shape to the call:
```typescript
await UserReportPage({ params: Promise.resolve({ userId: "u-1" }) });
```
The param shape mirrors `params: Promise<{ userId: string }>` etc. — match the actual page's signature exactly (Read the page first to confirm).

If a page uses additional Supabase tables that the chain mock above doesn't cover (rpc calls, storage calls), extend the mock chain inline in the test file with the minimum stubs needed; do not commit a shared mock helper (per CONVENTIONS.md "No barrel files / no shared fixture files").

Run `npm run test -- src/app/\(dashboard\)/admin/reports` and verify:
- All 12 `it` cases run
- The "calls requireAdmin before creating a Supabase client" case FAILS for each page (because `requireAdmin` is never invoked) — this is the expected red state
- The two redirect cases may pass spuriously (the test mocks throw their own redirect; the page never gets a chance to redirect itself). That is acceptable: the call-order test is the load-bearing assertion; the redirect tests document the contract for downstream changes.

If the call-order test passes spuriously (which would mean the page already calls `requireAdmin`), STOP and surface to the developer — the bug may already be fixed and this plan is moot.

Commit with message:
```
test(01-auth): HARDEN-01 failing regression for admin report guards

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run test -- src/app/\(dashboard\)/admin/reports 2>&1 | tee /tmp/harden-01-red.log; grep -E "(FAIL|✓|×|Tests.*failed)" /tmp/harden-01-red.log</automated>
  </verify>
  <acceptance_criteria>
    - The four test files exist at the paths in `<files>`
    - `npm run test -- src/app/\(dashboard\)/admin/reports` reports the four "calls requireAdmin before creating a Supabase client" cases as failing (one per page)
    - The failing-tests commit message starts with `test(01-auth):`
    - `git log -1 --name-only` shows ONLY the four `*.test.ts` files and no production-code changes
  </acceptance_criteria>
  <done>Failing tests are committed in their own commit; the implementation commit will be a separate, distinct commit per AGENTS.md TDD rule.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add requireAdmin guard to the four report pages and commit</name>
  <files>
    - src/app/(dashboard)/admin/reports/page.tsx
    - src/app/(dashboard)/admin/reports/users/[userId]/page.tsx
    - src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx
    - src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx
  </files>
  <read_first>
    - src/app/(dashboard)/admin/reports/page.tsx (verify current imports — `requireAdmin` may not yet be imported)
    - src/app/(dashboard)/admin/reports/users/[userId]/page.tsx
    - src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx
    - src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx
    - src/app/(dashboard)/admin/layout.tsx (canonical analog — copy the import + call style)
    - .planning/phases/01-auth-and-access-hardening/01-PATTERNS.md (section "src/app/(dashboard)/admin/reports/**/page.tsx — HARDEN-01")
  </read_first>
  <action>
For each of the four pages, make the minimum change required by the failing tests:

1. Add the import — match the existing import-ordering convention (third-party first, then `@/lib/*`, then siblings). Place it grouped with other `@/lib/*` imports:
```typescript
import { requireAdmin } from "@/lib/auth/guard";
```
If the file already imports from `@/lib/auth/guard` (e.g. `getAuthedProfile`), extend the existing destructure rather than adding a duplicate import line.

2. Insert `await requireAdmin();` as the FIRST statement of the default-exported async function, before any `await params` and before any `createClient()` call. Per D-02 implicit, the report pages do not need to capture the returned profile (none of them currently use the actor identity for filtering). Do not assign to a variable — match `src/app/(dashboard)/admin/layout.tsx`'s call style:
```typescript
await requireAdmin();
```

3. Add an inline rationale comment matching CONVENTIONS.md style (`// HARDEN-01: ...`):
```typescript
// HARDEN-01: page-level guard so a direct fetch can't bypass the layout.
```

Final shape for `src/app/(dashboard)/admin/reports/page.tsx`:
```typescript
export default async function AdminReportsPage() {
  // HARDEN-01: page-level guard so a direct fetch can't bypass the layout.
  await requireAdmin();
  const supabase = await createClient();
  // ...existing body unchanged
}
```

Final shape for the three param pages (use the file's actual param destructure):
```typescript
export default async function UserReportPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  // HARDEN-01: page-level guard so a direct fetch can't bypass the layout.
  await requireAdmin();
  const { userId } = await params;
  const supabase = await createClient();
  // ...existing body unchanged
}
```

Critical ordering rules (these are what the call-order test asserts):
- `await requireAdmin()` must be BEFORE `await params`
- `await requireAdmin()` must be BEFORE `await createClient()`
- Do NOT introduce a try/catch around `requireAdmin` — it is supposed to throw on redirect

Do NOT touch any other logic in these files. The existing aggregation, RLS reliance, and `as string` assertions are out of scope (they belong to TYPE-01 in Phase 4).

Run `npm run test -- src/app/\(dashboard\)/admin/reports`. Expect all 12 `it` cases to pass.

Run `npm run verify` to confirm typecheck + the rest of the unit suite still passes.

Commit with message:
```
feat(01-auth): HARDEN-01 add requireAdmin guard to admin report pages

Per the existing src/app/(dashboard)/admin/layout.tsx pattern. Closes the
direct-fetch admin data exposure surface called out in
.planning/codebase/CONCERNS.md "Security Considerations".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>npm run verify 2>&1 | tail -40 && grep -c "await requireAdmin()" src/app/\(dashboard\)/admin/reports/page.tsx src/app/\(dashboard\)/admin/reports/users/\[userId\]/page.tsx src/app/\(dashboard\)/admin/reports/courses/\[courseId\]/page.tsx src/app/\(dashboard\)/admin/reports/programs/\[programId\]/page.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'await requireAdmin()' src/app/(dashboard)/admin/reports/page.tsx` returns >= 1
    - `grep -c 'await requireAdmin()' src/app/(dashboard)/admin/reports/users/[userId]/page.tsx` returns >= 1
    - `grep -c 'await requireAdmin()' src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx` returns >= 1
    - `grep -c 'await requireAdmin()' src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx` returns >= 1
    - `npm run verify` exits 0
    - `npm run test -- src/app/\(dashboard\)/admin/reports` reports 12 passed, 0 failed
    - `git log -1 --name-only` shows the four production page files (and nothing else)
  </acceptance_criteria>
  <done>HARDEN-01 acceptance criterion satisfied: each admin report page enforces admin role at the function boundary, and a regression test exists per page that fails if the guard is removed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → Next.js server | Authenticated learner could navigate directly to `/admin/reports/**`. Currently the layout guard fires on navigation, but a direct route handler fetch (or any future routing change that re-parents the report tree) would bypass the layout entirely. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-1-01 | Information Disclosure | `src/app/(dashboard)/admin/reports/page.tsx` and the three nested report pages | mitigate | Page-level `await requireAdmin()` as the first statement (Task 3); regression unit per page asserts call order (Task 2). Defence in depth alongside RLS on `program_access` / `course_access` (CONCERNS.md current mitigation). |
| T-01-1-02 | Elevation of Privilege | Future routing changes that re-parent reports outside `(dashboard)/admin/` | mitigate | Page-level guard is portable: it survives any layout re-organisation. The regression tests pin the contract regardless of route position. |

threat_model:
  threats_mitigated:
    - id: T-01-1-01
      description: Learner direct-fetch to admin report URL exposes admin data despite RLS partial coverage
      severity: high
      mitigation: Task 3 adds `await requireAdmin()` at the top of all four pages; Task 2's regression unit fails if it is removed.
    - id: T-01-1-02
      description: Future layout re-parenting could re-expose reports if only the layout enforces auth
      severity: medium
      mitigation: Page-level guard is portable; tests pin the contract.
  residual_risk:
    - description: TYPE-01 cleanup of `as string` assertions is deliberately deferred (Phase 4); schema drift in report queries remains undetected at compile time. Severity low.
  asvs_mapping: V1.4 (Access Control Architecture), V4.1 (General Access Control Design)
</threat_model>

<verification>
Phase-level checks for this plan:
- `npm run verify` exits 0 with no new TypeScript errors
- `npm run test -- src/app/\(dashboard\)/admin/reports` reports 12/12 passing
- Each of the four report pages contains `await requireAdmin()` as the first statement of its default-exported async function (grep)
- The four test files exist at the paths in `files_modified`
- Two distinct commits in `git log`: a `test(01-auth): ...` commit followed by a `feat(01-auth): ...` commit, in that order

E2E follow-up: not in scope for this plan. TEST-03 (Phase 4) covers the Playwright write-path regression for admin pages.
</verification>

<success_criteria>
- HARDEN-01 acceptance criterion is met: a learner-session fetch to any admin report URL is redirected to `/dashboard` (the codebase convention; PATTERNS.md "Why requireAdmin not getAuthedProfile") and an unauthenticated fetch is redirected to `/login`. The accompanying regression unit per page enforces this contract.
- Failing-tests commit precedes the implementation commit (TDD per AGENTS.md).
- No additional production-code changes outside the four pages.
- No changes to RLS, no changes to the layout, no changes to the report queries themselves.
</success_criteria>

<output>
After completion, create `.planning/phases/01-auth-and-access-hardening/01-1-SUMMARY.md` summarising:
- HARDEN-01 closed; four pages guarded; one regression test per page committed
- Commit shas for the test commit and the implementation commit
- Confirmation that `npm run verify` is green
</output>
