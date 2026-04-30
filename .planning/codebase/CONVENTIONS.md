# Coding Conventions

**Analysis Date:** 2026-04-30

## Naming Patterns

**Files:**
- kebab-case for all source files: `sanitize-next.ts`, `new-submission.ts`, `role-groups-editor.tsx`
- Test files co-located alongside the file under test with `.test.ts` suffix: `score.ts` / `score.test.ts`
- Integration tests use `.integration.test.ts` suffix (excluded from the unit suite)
- Server action files named `actions.ts` in the same directory as their page
- Form components named `[noun]-form.tsx`: `program-form.tsx`, `course-form.tsx`, `invite-form.tsx`
- Page files are always `page.tsx`; layout files are always `layout.tsx`

**Functions:**
- camelCase for all functions: `scoreQuizAttempt`, `parseProgramInput`, `shapeProgramsResponse`
- Parser functions prefixed `parse`: `parseProgramInput`, `parseCourseInput`, `parseInviteInput`
- Shaper functions prefixed `shape`: `shapeProgramsResponse`, `shapeCourseResponse`
- Guard/auth functions prefixed with intent: `requireAdmin`, `getAuthedProfile`, `isAdminEmail`
- Email render functions prefixed `render`: `renderNewSubmissionEmail`, `renderCertificateHtml`
- Client factories named `createClient` (scoped by module): `createClient` in `server.ts`, `createAdminClient` in `admin.ts`

**Variables:**
- camelCase: `progressByCourse`, `requiredLessonsByCourse`, `attemptsLeft`
- Boolean variables use descriptive names without `is` prefix when clear from context: `hasPass`, `pending`
- Constants at module scope in SCREAMING_SNAKE_CASE: `MAX_TITLE_LEN`, `MAX_DESCRIPTION_LEN`

**Types:**
- PascalCase for all type and interface names: `ProgramInput`, `AuthedProfile`, `ScoringQuestion`
- Discriminated unions use a literal `ok` or `state` field for narrowing: `{ ok: true; value: T } | { ok: false; errors: ... }`, `{ state: "open" ... } | { state: "cooldown" ... }`
- Generic type alias `ParseResult<T>` is redefined per domain module (no shared import) in `src/lib/programs/validate.ts`, `src/lib/courses/validate.ts`, `src/lib/invites/validate.ts`
- `FormState` exported from `actions.ts` and reused by the paired form component

## Code Style

**Formatting:**
- TypeScript strict mode enabled (`"strict": true` in `tsconfig.json`)
- Target: ES2017; module resolution: bundler
- No explicit Prettier config detected — ESLint handles style through `eslint-config-next`

**Linting:**
- ESLint 9 flat config via `eslint.config.mjs`
- Extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- Ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`

## Import Organization

**Order (observed pattern):**
1. Node built-ins (`node:fs`, `node:path`, `node:crypto`) — prefixed with `node:` scheme
2. Third-party packages (`next/navigation`, `react`, `@supabase/ssr`)
3. Internal `@/lib/*` imports (path alias for `src/`)
4. Sibling or relative imports (`./actions`, `./validate`)

**Path Aliases:**
- `@/*` maps to `src/*`
- `@tests/*` maps to `tests/*` (integration test helpers)

**Example from `src/app/(dashboard)/admin/users/actions.ts`:**
```ts
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { parseInviteInput } from "@/lib/invites/validate";
```

## Error Handling

**Server actions return discriminated union, never throw:**
```ts
export type FormState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; values?: Partial<ProgramInput> }
  | null;
```

**Supabase error pattern** — destructure `{ error }` and early-return on failure:
```ts
const { error } = await supabase.from("programs").update(...).eq("id", id);
if (error) return { ok: false, error: error.message };
```

**Unknown catch errors** — always narrow with `instanceof Error`:
```ts
const message = e instanceof Error ? e.message : "Admin client unavailable.";
```

**Null-coalescing fallback for Supabase nullable error message:**
```ts
return { ok: false, error: error?.message ?? "Couldn't create program." };
```

**Auth guards** redirect rather than returning errors:
```ts
if (!profile) redirect("/login");
if (profile.system_role !== "owner" && profile.system_role !== "admin") redirect("/dashboard");
```
(`src/lib/auth/guard.ts`)

**Fire-and-forget** for non-critical async side effects (e.g., enrollment email):
- Comment the intent explicitly: `// Fire-and-forget — an SMTP failure shouldn't block the invite`

## Logging

No logging framework. No `console.*` calls in production code. Errors surfaced through return values and UI display.

## Comments

**JSDoc style** for public functions with non-obvious behaviour:
- Document rules, not types: see `scoreQuizAttempt` in `src/lib/quizzes/score.ts`
- Security warnings on sensitive clients: see `createAdminClient` in `src/lib/supabase/admin.ts`
- Implementation rationale for non-obvious decisions: inline `//` comments (`// Defense in depth: re-check eligibility server-side`)

**No FIXME/TODO** comments exist in the current codebase.

## Module Design

**Exports:**
- Named exports only — no default exports from lib modules
- `export default` used only for Next.js page and layout components (framework requirement)
- Types exported alongside the functions that use them from the same file

**No barrel files** (`index.ts`). Import directly from the specific module file.

**Server directive placement:** `"use server"` and `"use client"` directives are always the first line of the file, before any imports.

## Function Design

**Size:** Functions are small and single-purpose. Utility helpers extracted when reused (e.g., `fieldResult` private helper in `actions.ts` files, `toOptionArray` in `quiz-actions.ts`).

**Parameters:** Destructured object params for functions with 3+ arguments or optional fields:
```ts
export function computeQuizEligibility({
  maxAttempts,
  retakeCooldownHours,
  attempts,
  now,
}: { ... }): Eligibility { ... }
```

**Return values:** Discriminated unions preferred over thrown exceptions for recoverable errors. Functions that can never fail use direct return types.

## React / Next.js Conventions

**Server Components** are the default. Pages fetch data directly from Supabase using `createClient()` from `src/lib/supabase/server.ts`.

**Client Components** (`"use client"`) are used only for interactive UI: forms with `useActionState`, draggable editors, buttons with client callbacks.

**`useActionState`** is the form state pattern:
```tsx
const [state, formAction, pending] = useActionState<FormState, FormData>(action, null);
```

**`revalidatePath`** called at the end of every mutating server action before `redirect` or returning `{ ok: true }`.

**Tailwind CSS** for all styling. `cn()` utility (`src/lib/utils.ts`) combines `clsx` and `tailwind-merge` for conditional class composition.

**shadcn/ui** components in `src/components/ui/` — treated as vendored code, not modified directly.

---

*Convention analysis: 2026-04-30*
