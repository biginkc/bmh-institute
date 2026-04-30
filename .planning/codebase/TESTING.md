# Testing Patterns

**Analysis Date:** 2026-04-30

## Test Framework

**Unit Runner:**
- Vitest 4.x
- Config: `vitest.config.ts`
- Environment: `node`

**Integration Runner:**
- Vitest 4.x (separate config)
- Config: `vitest.integration.config.ts`
- Environment: `node`
- Hits a real Supabase database; sequential execution (`fileParallelism: false`); 30s test timeout

**E2E Runner:**
- Playwright 1.59.x
- Config: `playwright.config.ts` (local dev server on port 3200) and `playwright.prod.config.ts` (live production URL)
- Browser: Chromium only (Desktop Chrome device profile)
- Single worker, not parallelised (`fullyParallel: false, workers: 1`)

**Assertion Library:**
- Vitest built-in (`expect` from `"vitest"`)
- Playwright built-in (`expect` from `"@playwright/test"`)

**Run Commands:**
```bash
npm run test              # Vitest unit suite (all src/**/*.test.ts, excludes *.integration.test.ts)
npm run test:watch        # Vitest in watch mode
npm run test:integration  # Vitest integration suite (src/**/*.integration.test.ts)
npm run test:e2e          # Playwright against local dev server (port 3200)
npm run test:prod         # Playwright against live production URL
npm run verify            # tsc --noEmit && vitest run (gates husky pre-commit hook)
```

## Test File Organization

**Location:** Co-located with the implementation file, same directory.

**Naming:**
- Unit tests: `[module].test.ts` (e.g., `score.test.ts` alongside `score.ts`)
- Integration tests: `[module].integration.test.ts`
- Playwright specs: `[feature].spec.ts` in `e2e-prod/`
- Playwright auth setup: `auth.setup.ts` in `e2e-prod/`

**Structure:**
```
src/lib/quizzes/
├── score.ts
├── score.test.ts
├── shuffle.ts
├── shuffle.test.ts
├── attempts.ts
└── attempts.test.ts

src/lib/programs/
├── validate.ts
├── validate.test.ts
├── shape.ts
└── shape.test.ts

e2e-prod/
├── auth.setup.ts      # Playwright auth fixture
├── dashboard.spec.ts
├── admin.spec.ts
└── .auth/state.json   # Saved browser session (gitignored content)
```

## Test Structure

**Suite organization (Vitest):**
```typescript
import { describe, expect, it } from "vitest";
import { scoreQuizAttempt } from "./score";

describe("scoreQuizAttempt", () => {
  it("returns 0% and not passed when there are no questions", () => {
    const result = scoreQuizAttempt([], {}, 80);
    expect(result).toEqual({ score: 0, passed: false, earnedPoints: 0, totalPoints: 0 });
  });

  it("awards full points when a single_choice answer is correct", () => {
    // ...
  });
});
```

**Env manipulation with lifecycle hooks** (`src/lib/auth/allowlist.test.ts`):
```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("isAdminEmail", () => {
  const originalAdmins = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  afterEach(() => {
    if (originalAdmins === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = originalAdmins;
    }
  });
  // ...
});
```

**Patterns:**
- Each `it` description states the expected outcome first: `"returns 0% and not passed when..."`, `"awards full points when..."`
- No nested `describe` blocks — one `describe` per file matches the exported function under test
- Tests are synchronous unless the function under test is async (pure logic functions have no async tests)
- Type narrowing inside tests mirrors production code: `if (!result.ok) return;` after asserting `result.ok` is true

## Mocking

**No mocking framework used.** The current unit test suite contains zero `vi.mock`, `vi.fn`, or `vi.spyOn` calls.

**Strategy:** Pure function isolation. Library code in `src/lib/` is written as pure functions (input → output, no I/O) so tests exercise real logic without mocks.

**What NOT to mock:**
- Business logic functions (`scoreQuizAttempt`, `parseProgramInput`, `shapeProgramsResponse`)
- Email render functions (`renderNewSubmissionEmail`, `renderEnrollmentEmail`)

**What to isolate instead:**
- Supabase calls are pushed to server actions and pages — not tested at unit level
- SMTP is abstracted behind `sendEmail` in `src/lib/email/send.ts`; tests cover the render layer only, not the transport
- Environment variables manipulated directly via `process.env` in `beforeEach`/`afterEach` (see `allowlist.test.ts`)

## Fixtures and Factories

**No shared fixture files or factory helpers** exist in the codebase.

**Per-test data** is defined inline using local constants or `FormData` builder helpers:

```typescript
// FormData helper — repeated in validate test files
function fd(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}
```
(`src/lib/programs/validate.test.ts`, `src/lib/courses/validate.test.ts`)

```typescript
// Multi-value FormData variant for arrays
function fd(values: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (Array.isArray(v)) {
      for (const item of v) f.append(k, item);
    } else {
      f.set(k, v);
    }
  }
  return f;
}
```
(`src/lib/invites/validate.test.ts`)

**Shared baseline objects** for email render tests:
```typescript
const BASE = {
  learnerName: "Gretchen",
  assignmentTitle: "Phone objections homework",
  // ...
};
// Tests spread BASE and override specific fields
renderNewSubmissionEmail({ ...BASE, submissionKind: "url", ... });
```
(`src/lib/email/new-submission.test.ts`, `src/lib/email/review.test.ts`)

**Fixed timestamps** for time-dependent tests:
```typescript
const NOW = new Date("2026-04-23T18:00:00Z");
```
(`src/lib/quizzes/attempts.test.ts`)

## Coverage

**Requirements:** No coverage threshold configured. No `@vitest/coverage-*` package installed.

**View Coverage:**
```bash
# Not configured — run manually with:
npx vitest run --coverage
```

## Test Types

**Unit Tests (`src/**/*.test.ts`):**
- Cover pure business logic functions in `src/lib/`
- Zero external I/O — no Supabase, no SMTP, no filesystem
- Fast; run on every pre-commit via `npm run verify`
- Current coverage areas:
  - Quiz scoring: `src/lib/quizzes/score.test.ts`
  - Quiz eligibility: `src/lib/quizzes/attempts.test.ts`
  - Deterministic shuffle: `src/lib/quizzes/shuffle.test.ts`
  - Program validation: `src/lib/programs/validate.test.ts`
  - Program shaping: `src/lib/programs/shape.test.ts`
  - Course validation: `src/lib/courses/validate.test.ts`
  - Course shaping: `src/lib/courses/shape.test.ts`
  - Invite validation: `src/lib/invites/validate.test.ts`
  - Admin allowlist: `src/lib/auth/allowlist.test.ts`
  - Certificate rendering: `src/lib/certificates/render.test.ts`
  - Email rendering: `src/lib/email/new-submission.test.ts`, `src/lib/email/enrollment.test.ts`, `src/lib/email/review.test.ts`
  - URL sanitizer: `src/app/(auth)/login/sanitize-next.test.ts`

**Integration Tests (`src/**/*.integration.test.ts`):**
- Pattern defined; no integration test files currently present in the repo
- Config (`vitest.integration.config.ts`) loads credentials from `.env.test.local`
- Intended to cover: RLS policies, Realtime publications, `pg_*` extensions, `SECURITY DEFINER` functions
- Runs sequentially (shared tables are `TRUNCATE`d in `beforeEach`)
- Not gated by the pre-commit hook (too slow; requires network and credentials)

**E2E Tests (Playwright):**
- `e2e-prod/` — read-only smoke tests against the live production deployment
- Auth setup in `e2e-prod/auth.setup.ts`: logs in via the real `/login` form and saves browser session to `e2e-prod/.auth/state.json`
- All specs depend on the `setup` project; Chromium tests run after authentication
- Specs use accessible role selectors (`getByRole`, `getByLabel`) and text matchers (`getByText`, `/regex/i`)
- `data-slot` attribute used when shadcn renders non-semantic elements: `page.locator('[data-slot="card-title"]')`
- No `e2e/` directory exists — local dev E2E config (`playwright.config.ts`) points to `./e2e` but those files have not been created yet

## Playwright Patterns

**Auth setup:**
```typescript
import { test as setup, expect } from "@playwright/test";

setup("authenticate via the live /login form", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(dashboard|auth\/set-password)/, { timeout: 20_000 });
  await page.context().storageState({ path: STORAGE_STATE });
});
```

**Spec structure (no describe nesting for simple flows; `test.describe` used for grouped admin surfaces):**
```typescript
import { test, expect } from "@playwright/test";

test("dashboard lists the signed-in user's training", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /your training/i })).toBeVisible();
});

test.describe("admin surfaces", () => {
  test("overview shows stat cards", async ({ page }) => { ... });
});
```

**Ambiguous state handled with `.or()`:**
```typescript
const programHit = page.getByText(/appointment setter onboarding/i);
const emptyHit = page.getByText(/no programs yet/i);
await expect(programHit.or(emptyHit).first()).toBeVisible();
```

---

*Testing analysis: 2026-04-30*
