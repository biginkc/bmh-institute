# Phase 2: Content Safety and Rate Limiting - Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 16 (8 new, 8 modified — counting tests + script + migration)
**Analogs found:** 16 / 16

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/sanitize/text-block.ts` (NEW) | lib helper / pure transform | request-response (in-memory) | `src/lib/certificates/render.ts` | exact |
| `src/lib/sanitize/text-block.test.ts` (NEW) | unit test | n/a | `src/lib/quizzes/score.test.ts` | exact |
| `src/lib/sanitize/certificate.ts` (NEW) | lib helper / pure transform | request-response (in-memory) | `src/lib/certificates/render.ts` | exact |
| `src/lib/sanitize/certificate.test.ts` (NEW) | unit test | n/a | `src/lib/quizzes/score.test.ts` | exact |
| `src/lib/rate-limit/check.ts` (NEW) | lib helper / DB-backed gate | request-response + Supabase RPC | `src/lib/auth/guard.ts` (admin-gated helper) + `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` (admin-client + RPC pattern) | role-match |
| `src/lib/rate-limit/check.test.ts` (NEW) | unit test (mocked admin client) | n/a | `src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts` | exact |
| `src/lib/rate-limit/check.integration.test.ts` (NEW) | integration test (live Supabase) | n/a | `src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts` | exact |
| `src/lib/rate-limit/ip.ts` (NEW) | lib helper / pure parser | request-response (header read) | `src/lib/certificates/render.ts` (pure transform) | role-match |
| `src/lib/rate-limit/ip.test.ts` (NEW) | unit test | n/a | `src/lib/quizzes/score.test.ts` | exact |
| `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts` (MODIFY) | server action | admin-gated mutation | self — extend existing `updateBlock` | exact |
| `src/components/content-blocks.tsx` (MODIFY lines 98-104, 445-465) | server component | render | self — extend existing `EmbedBlock` | exact |
| `src/components/content-blocks.test.tsx` (NEW) | RTL test | n/a | `src/app/(dashboard)/certificates/print-button.test.tsx` | role-match |
| `src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx` (MODIFY ~line 833) | client component | form input | self — extend embed input section | exact |
| `src/app/(auth)/forgot-password/actions.ts` (MODIFY) | server action | rate-limit gate + Supabase auth | self — wrap existing body | exact |
| `src/app/auth/set-password/actions.ts` (MODIFY) | server action | rate-limit gate + Supabase auth | self — wrap existing body | exact |
| `supabase/migrations/011_auth_rate_limits.sql` (NEW) | migration / RPC | DB DDL + SECURITY DEFINER function | `supabase/migrations/010_prevent_last_owner_deletion.sql` | exact |
| `scripts/backfill-sanitize-html.ts` (NEW) | one-shot Node script | batch transform | `src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts` (only existing service-role-from-Node usage) | role-match |

## Pattern Assignments

### `src/lib/sanitize/text-block.ts` (lib helper, pure transform)

**Analog:** `src/lib/certificates/render.ts` — same shape: pure HTML-string-in / HTML-string-out function, JSDoc explaining the rule, named export only, no class.

**Imports + module-doc pattern** (`src/lib/certificates/render.ts:1-5`):
```typescript
/**
 * Resolves the {{merge_field}} placeholders inside a certificate template's
 * body_html. Unknown fields render as empty strings so an admin typo in
 * a template can't crash a learner's certificate page.
 */
export function renderCertificateHtml(
```

**Function shape pattern** (`src/lib/certificates/render.ts:6-14`):
```typescript
export function renderCertificateHtml(
  bodyHtml: string,
  fields: { /* ... */ },
): string {
  return bodyHtml.replace(/* ... */);
}
```

Apply: a single named `export function sanitizeTextBlockHtml(input: string): string` that calls `sanitize-html` with a module-scoped `STRICT_OPTIONS` const. JSDoc above the function documenting "strict prose only; admin save path; renderer keeps `dangerouslySetInnerHTML`."

---

### `src/lib/sanitize/text-block.test.ts` (unit test)

**Analog:** `src/lib/quizzes/score.test.ts` — closest existing pure-function unit test using Vitest.

**Imports + describe shape** (`src/lib/quizzes/score.test.ts:1-5`):
```typescript
import { describe, expect, it } from "vitest";

import { scoreQuizAttempt, type ScoringQuestion } from "./score";

describe("scoreQuizAttempt", () => {
```

**Per-case naming style** (`src/lib/quizzes/score.test.ts:6-25`):
```typescript
it("returns 0% and not passed when there are no questions", () => {
  const result = scoreQuizAttempt([], {}, 80);
  expect(result).toEqual({
    score: 0,
    passed: false,
    earnedPoints: 0,
    totalPoints: 0,
  });
});

it("awards full points when a single_choice answer is correct", () => {
  // ...
});
```

Apply: one `describe("sanitizeTextBlockHtml", ...)` block with `it("strips <script> tags entirely", ...)`, `it("rejects javascript: hrefs", ...)`, `it("forces rel=\"noopener noreferrer\" on external links", ...)`, `it("is idempotent — sanitize(sanitize(x)) === sanitize(x)", ...)`, `it("strips style attributes", ...)`. Plain Vitest, no mocks.

---

### `src/lib/sanitize/certificate.ts` (lib helper, pure transform)

**Analog:** `src/lib/certificates/render.ts` — same neighborhood (`src/lib/certificates/`), same shape.

**Pattern:** mirror `text-block.ts` but with `CERTIFICATE_OPTIONS` allowing `div, span, img` plus the `allowedStyles` regex map. Single named export `sanitizeCertificateBodyHtml`. JSDoc must call out: "Allow-list must accept the inline `style` properties used by the 005 seed templates — `font-size, color, margin, margin-top, padding, text-align, font-family, font-weight`. Backfill diff against 005 seed proves no drift."

---

### `src/lib/sanitize/certificate.test.ts` (unit test)

**Analog:** `src/lib/quizzes/score.test.ts` (test shape) + `supabase/migrations/005_seed_dev.sql` lines 11-39 (fixture source).

Apply: same Vitest shape as `text-block.test.ts`, plus a fixture-driven case that asserts the 005 seed `body_html` survives sanitization unchanged. Reference to seed style usage from `005_seed_dev.sql`:
```sql
'<div style="text-align:center;padding:48px;font-family:Georgia,serif">'
'<h1 style="font-size:36px;margin-bottom:8px">Certificate of Completion</h1>'
'<p style="font-size:14px;margin-top:32px;color:#666">Certificate number: {{certificate_number}}</p>'
```

Test asserts `sanitizeCertificateBodyHtml(seedBody) === seedBody` for both seed templates.

---

### `src/lib/rate-limit/check.ts` (lib helper, DB-backed gate)

**Analog:** `src/lib/auth/guard.ts` (function-as-gate shape) + the admin-client + RPC call pattern from `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts:189-195`.

**Admin-client construction pattern** (`src/lib/supabase/admin.ts:12-23`):
```typescript
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Admin Supabase client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

**Defensive try/catch around `createAdminClient()`** (`src/app/(dashboard)/admin/users/[userId]/edit/actions.ts:189-195`):
```typescript
let admin;
try {
  admin = createAdminClient();
} catch (e) {
  const message = e instanceof Error ? e.message : "Admin client unavailable.";
  return { ok: false, error: message };
}
```

**Discriminated-union return shape** (`src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts:8-10`):
```typescript
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };
```

Apply: export `RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }`. Function `checkAndConsume({ keyType, keyValue, threshold, windowSeconds })` calls `createAdminClient()`, then `admin.rpc("fn_check_and_consume_rate_limit", { p_key_type, p_key_value, p_threshold, p_window_seconds })`. On error throw (per RESEARCH §6 fail-closed recommendation); the caller decides the user-visible response.

---

### `src/lib/rate-limit/check.test.ts` (unit test, mocked admin client)

**Analog:** `src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts` — closest existing test that mocks `createAdminClient` for unit-testing a function which invokes it.

**`vi.mock` shape** (`src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts:48-55`):
```typescript
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    if (adminFactoryThrows) throw adminFactoryThrows;
    return {
      auth: { admin: { deleteUser: deleteUserSpy } },
    };
  }),
}));
```

**Reset pattern** (`src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts:62-73`):
```typescript
beforeEach(() => {
  actor = { /* defaults */ };
  // ...reset module-scoped state
});

afterEach(() => {
  vi.clearAllMocks();
});
```

Apply: `vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }))`. Per case, set `mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null }) })`. Cases: allowed-pass-through, denied-with-retry, RPC-error-throws (fail-closed contract).

---

### `src/lib/rate-limit/check.integration.test.ts` (integration test)

**Analog:** `src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts` — only existing integration test in repo. Pattern is locked.

**`describe.skipIf` env-gating** (`actions.integration.test.ts:27-41`):
```typescript
const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(SUPABASE_URL && ANON && SERVICE_ROLE);

const admin =
  SUPABASE_URL && SERVICE_ROLE
    ? createSbClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

describe.skipIf(!envPresent)(
  "deleteUser integration (HARDEN-03)",
  () => {
```

**Throwaway-key + cleanup pattern** (`actions.integration.test.ts:54-99`):
```typescript
const email = `harden-03-${randomBytes(8).toString("hex")}@bmh.invalid`;
let userId: string | null = null;

try {
  // ...setup, action under test, assertions...
  userId = null;
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
}
```

Apply: throwaway `key_value` = `harden06-${randomBytes(8).toString("hex")}`. Inside `try`, hit `admin.rpc("fn_check_and_consume_rate_limit", ...)` `threshold` times, assert `allowed: true`. Hit it once more, assert `allowed: false` and `retry_after_seconds > 0`. In `finally`, `admin.from("auth_rate_limits").delete().eq("key_value", key)`. Use `randomBytes` from `node:crypto` exactly like the analog.

---

### `src/lib/rate-limit/ip.ts` (lib helper, pure parser)

**Analog:** `src/lib/certificates/render.ts` — pure pure-string-in / pure-string-out helper. Stays unit-testable by accepting a duck-typed `{ get }` rather than calling `headers()` itself (RESEARCH §5).

**Imports + named-export pattern** (`src/lib/certificates/render.ts:6, 31`):
```typescript
export function renderCertificateHtml(/* ... */): string { /* ... */ }
function escapeHtml(v: string): string { /* ... */ }
```

Apply: `export function extractClientIp(headers: { get: (name: string) => string | null }): string`. First-entry `x-forwarded-for` per Vercel docs; fallback to `x-real-ip`; fallback to `"0.0.0.0"`. No imports of `next/headers` — caller in the action does the `await headers()` call and passes the result in.

---

### `src/lib/rate-limit/ip.test.ts` (unit test)

**Analog:** `src/lib/quizzes/score.test.ts` — same plain-Vitest shape.

Apply: helper `fakeHeaders(values)` returning `{ get }`, four cases: first-entry of XFF, fallback to `x-real-ip`, fallback to `"0.0.0.0"`, whitespace trim.

---

### `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts` (MODIFY — `updateBlock`)

**Analog:** self — `updateBlock` lines 99-120. Pattern is already correct (`requireAdmin()` then mutate). Phase 2 inserts sanitization between auth and write.

**Existing pattern to extend** (`src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts:99-120`):
```typescript
export async function updateBlock(input: {
  blockId: string;
  lessonId: string;
  content: Record<string, unknown>;
  is_required_for_completion?: boolean;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const patch: Record<string, unknown> = { content: input.content };
  if (typeof input.is_required_for_completion === "boolean") {
    patch.is_required_for_completion = input.is_required_for_completion;
  }
  const { error } = await supabase
    .from("content_blocks")
    .update(patch)
    .eq("id", input.blockId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}
```

Apply (per RESEARCH Open Question 1, recommended option (b)): read `block_type` from the `content_blocks` row before sanitizing. Insert this between `await createClient()` and `const patch`:
```typescript
const { data: existing } = await supabase
  .from("content_blocks")
  .select("block_type")
  .eq("id", input.blockId)
  .maybeSingle();
if (!existing) return { ok: false, error: "Block not found." };

let safeContent = input.content;
if (existing.block_type === "text" && typeof input.content.html === "string") {
  safeContent = { ...input.content, html: sanitizeTextBlockHtml(input.content.html) };
} else if (existing.block_type === "embed" && typeof input.content.iframe_src === "string") {
  const src = input.content.iframe_src.trim();
  if (!src.startsWith("https://")) {
    return { ok: false, error: "Embed URL must start with https://" };
  }
  safeContent = { ...input.content, iframe_src: src };
}
const patch: Record<string, unknown> = { content: safeContent };
```

`requireAdmin()` and `revalidatePath()` calls unchanged.

---

### `src/components/content-blocks.tsx` (MODIFY — `EmbedBlock` only)

**Analog:** self — lines 445-465.

**Existing iframe (lines 456-462):**
```tsx
<iframe
  src={src}
  title="Embedded content"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
  className="h-full w-full"
/>
```

Apply: add one `sandbox` attribute. Per CONTEXT.md D-B1, value is `"allow-scripts allow-same-origin allow-forms allow-presentation"`. Add an inline comment above the attribute documenting RESEARCH Pitfall §4 ("admin-trusted authoring + cross-origin destinations only"). `VideoBlock` (lines 388-401) is **not** modified.

`TextBlock` (lines 121-128) is **not** modified — sanitization runs on write per CONTEXT.md D-A2.

---

### `src/components/content-blocks.test.tsx` (NEW — RTL)

**Analog:** `src/app/(dashboard)/certificates/print-button.test.tsx` — only existing RTL test in the repo.

**Imports + harness pattern** (`print-button.test.tsx:6-20`):
```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrintButton } from "./print-button";

let printSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});
```

Apply: import `render` from `@testing-library/react`, `ContentBlockRenderer` from `./content-blocks`. Two cases:
1. Embed iframe renders with the locked sandbox flag set:
   ```typescript
   const iframe = container.querySelector("iframe");
   expect(iframe).not.toBeNull();
   expect(iframe!.getAttribute("sandbox")).toBe(
     "allow-scripts allow-same-origin allow-forms allow-presentation",
   );
   ```
2. No iframe rendered when `iframe_src` is missing.

No `userEvent` needed — pure render assertions. No `vi.mock` needed — `EmbedBlock` is a leaf with no Supabase/router dependencies.

---

### `src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx` (MODIFY — admin-trusted label)

**Analog:** self — embed editor section around line 833.

**Existing label pattern** (line 832-839):
```tsx
<div className="flex flex-col gap-1.5">
  <Label htmlFor={`src-${block.id}`}>Iframe src</Label>
  <Input
    id={`src-${block.id}`}
    value={src}
    onChange={(e) => setSrc(e.target.value)}
    placeholder="https://www.loom.com/embed/..."
  />
</div>
```

Apply per CONTEXT.md D-B3: add a short `<p className="text-muted-foreground text-xs">` below the input explaining the iframe is admin-trusted and runs sandboxed. No `<Tooltip>` — match the repo's existing helper-text style (other helper text in `blocks-editor.tsx` uses inline `<p>` muted-foreground).

---

### `src/app/(auth)/forgot-password/actions.ts` (MODIFY — wrap with rate-limit gate)

**Analog:** self — preserve discriminated-union return shape.

**Existing complete file** (`src/app/(auth)/forgot-password/actions.ts:1-30`):
```typescript
"use server";

import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

export async function sendPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "Email is required." };

  const supabase = await createClient();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://bmh-institute.vercel.app";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback`,
  });

  // Intentionally treat "user not found" the same as success to avoid
  // exposing which emails have accounts. Supabase already no-ops silently
  // for unknown emails, so we just trust its response here.
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

Apply per CONTEXT.md D-D1, D-D2:
1. Add imports: `import { headers } from "next/headers"`, `import { checkAndConsume } from "@/lib/rate-limit/check"`, `import { extractClientIp } from "@/lib/rate-limit/ip"`.
2. Lower-case the email before keying: `const emailKey = email.toLowerCase()`.
3. Insert two gates between input validation and the Supabase call:
   ```typescript
   const ip = extractClientIp(await headers());
   const ipGate = await checkAndConsume({ keyType: "ip", keyValue: ip, threshold: 5, windowSeconds: 15 * 60 });
   if (!ipGate.allowed) return { ok: true }; // silent per D-D2
   const emailGate = await checkAndConsume({ keyType: "email", keyValue: emailKey, threshold: 3, windowSeconds: 60 * 60 });
   if (!emailGate.allowed) return { ok: true }; // silent per D-D2
   ```
4. Both gates fire **before** any `supabase.auth.*` call (D-D3).
5. Existing `// Intentionally treat "user not found" the same as success...` comment is preserved verbatim. Add a new inline comment above the gate explaining the silent-breach contract.

---

### `src/app/auth/set-password/actions.ts` (MODIFY — wrap with rate-limit gate)

**Analog:** self.

**Existing complete file** (`src/app/auth/set-password/actions.ts:1-38`):
```typescript
"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type SetPasswordState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

export async function setPassword(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { ok: false, error: "Passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Open the invite link again." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };

  redirect("/dashboard");
}
```

Apply per CONTEXT.md D-D2 (explicit breach):
1. Same imports as forgot-password gate.
2. Source the email key from the recovery session (`user.email`), lowercased + trimmed.
3. Gate placement: between `getUser()` (so we have an email to key on) and `updateUser()`. Order matters — gate fires before the Supabase call:
   ```typescript
   const ip = extractClientIp(await headers());
   const ipGate = await checkAndConsume({ keyType: "ip", keyValue: ip, threshold: 5, windowSeconds: 15 * 60 });
   if (!ipGate.allowed) {
     const minutes = Math.max(1, Math.ceil(ipGate.retryAfterSeconds / 60));
     return { ok: false, error: `Too many attempts. Try again in ${minutes} minutes.` };
   }
   const emailKey = (user.email ?? "").trim().toLowerCase();
   if (emailKey) {
     const emailGate = await checkAndConsume({ keyType: "email", keyValue: emailKey, threshold: 3, windowSeconds: 60 * 60 });
     if (!emailGate.allowed) {
       const minutes = Math.max(1, Math.ceil(emailGate.retryAfterSeconds / 60));
       return { ok: false, error: `Too many attempts. Try again in ${minutes} minutes.` };
     }
   }
   ```
4. Final `redirect("/dashboard")` and the existing `getUser` / `updateUser` flow are unchanged.

---

### `supabase/migrations/011_auth_rate_limits.sql` (NEW migration)

**Analog:** `supabase/migrations/010_prevent_last_owner_deletion.sql` — most recent migration creating a `SECURITY DEFINER` function with explicit search_path lockdown. `008_answer_options_public_view.sql` is also a precedent for the grant/revoke style.

**Block-comment-as-rationale + function shape** (`010_prevent_last_owner_deletion.sql:1-46`):
```sql
-- BMH Institute: enforce "at least one owner" at the database layer.
-- HARDEN-03 follow-up (WR-04). The deleteUser server action checked the
-- owner count from a learner-scoped Supabase client and then performed
-- the auth.admin.deleteUser call separately. The check and the delete
-- are not in the same transaction, so two admins concurrently deleting
-- the only two remaining owners would both observe count = 2, both
-- pass the guard, and both succeed. The org would be left ownerless.
--
-- This migration moves the invariant into the database. ...

create or replace function public.fn_prevent_last_owner_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_owner_count integer;
begin
  -- ...
end;
$$;
```

**Grant/revoke pattern** (`008_answer_options_public_view.sql:14-15`):
```sql
grant select on public.answer_options_public to authenticated;
revoke select on public.answer_options from authenticated;
```

Apply (per RESEARCH Pattern 4):
1. Block comment explaining HARDEN-06, the per-IP and per-email thresholds, why service-role-only.
2. `create type public.auth_rate_limit_key_type as enum ('ip', 'email');`
3. `create table public.auth_rate_limits (...)` with PK `(key_type, key_value, window_start)` and `expires_at`.
4. `alter table public.auth_rate_limits enable row level security;` — no policies (deny-by-default for `authenticated` matches CONTEXT.md D-C1).
5. `create index idx_auth_rate_limits_lookup on public.auth_rate_limits (key_type, key_value, expires_at);`
6. `create or replace function public.fn_check_and_consume_rate_limit(...)` with `language plpgsql`, `security definer`, `set search_path = public` (mirror migration 010 lines 21-23 exactly). Body does opportunistic prune + `insert ... on conflict do update set count = count + 1 returning count` (atomic). Returns `table(allowed boolean, retry_after_seconds integer)`.
7. `revoke all on function public.fn_check_and_consume_rate_limit from public, anon, authenticated; grant execute on function public.fn_check_and_consume_rate_limit to service_role;`

---

### `scripts/backfill-sanitize-html.ts` (NEW one-shot script)

**Analog:** `src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts` is the only existing module that builds a service-role client at Node runtime (lines 32-39). The script reuses that pattern but imports `createAdminClient` directly.

**Service-role construction at Node runtime** (`actions.integration.test.ts:32-39`):
```typescript
const admin =
  SUPABASE_URL && SERVICE_ROLE
    ? createSbClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;
```

Apply (per RESEARCH Pattern 2):
1. Import `createAdminClient` from `@/lib/supabase/admin`, `sanitizeTextBlockHtml`, `sanitizeCertificateBodyHtml`.
2. `backfillContentBlocks()`: select rows where `block_type = 'text'`, sanitize `content.html`, skip when output equals input (idempotent), update with `{ ...content, html: safe }`. Log `${touched} rows sanitized`.
3. `backfillCertificateTemplates()`: same shape against `body_html` column.
4. `main()` calls both, top-level `.catch()` exits non-zero.
5. Add `"backfill:sanitize-html": "tsx scripts/backfill-sanitize-html.ts"` to `package.json` scripts (per RESEARCH Open Question 2 recommendation). Add `tsx` to `devDependencies` in the same plan that ships `sanitize-html`.

The script is **not** included in any test inventory; idempotency is proven by the unit-test assertion `sanitize(sanitize(x)) === sanitize(x)`. Document running order in the plan: backfill runs **after** the deploy that ships the new sanitize functions.

---

## Shared Patterns

### `requireAdmin()`-then-mutate
**Source:** `src/lib/auth/guard.ts:31-38`
**Apply to:** All admin server-action edits in this phase (`updateBlock` modification only — forgot-password and set-password are intentionally NOT admin-gated).
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
Sanitization always runs **after** `requireAdmin()` and **before** the Supabase write. Mirrors the Phase 1 pattern.

### Discriminated-union action result
**Source:** `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts:8-10`
**Apply to:** Every server action this phase touches — `updateBlock` keeps `ActionResult`; `sendPasswordReset` keeps `ForgotPasswordState`; `setPassword` keeps `SetPasswordState`.
```typescript
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };
```

### `revalidatePath()` after admin mutation
**Source:** `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts:33-35, 117-119, 134-135`
**Apply to:** `updateBlock` modification only — preserve the existing two `revalidatePath` calls verbatim.
```typescript
revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
revalidatePath(`/lessons/${input.lessonId}`);
```

### Service-role client behind a defensive try/catch
**Source:** `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts:189-195`
**Apply to:** `src/lib/rate-limit/check.ts` — admin client construction may throw on missing env vars. The rate-limit helper should let the throw bubble (fail-closed); the calling action's existing return paths already shape the user-visible error.

### Pure-function unit test (Vitest, no mocks)
**Source:** `src/lib/quizzes/score.test.ts`
**Apply to:** `text-block.test.ts`, `certificate.test.ts`, `ip.test.ts`. Module-scope `import { describe, expect, it } from "vitest"`; one `describe` per exported function; `it("does X", ...)` per behavior.

### Mocked-dependency unit test
**Source:** `src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts:48-73`
**Apply to:** `check.test.ts`. `vi.mock("@/lib/supabase/admin")`; module-scoped state vars reset in `beforeEach`; `vi.clearAllMocks()` in `afterEach`.

### Integration test with `describe.skipIf` env-gate
**Source:** `src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts:27-41`
**Apply to:** `check.integration.test.ts`. Throwaway key per case using `randomBytes(8).toString("hex")`. Always wrap in `try { ... } finally { /* admin.from("auth_rate_limits").delete().eq("key_value", key) */ }`.

### Migration block-comment as rationale
**Source:** `supabase/migrations/010_prevent_last_owner_deletion.sql:1-17`
**Apply to:** `011_auth_rate_limits.sql`. Lead with a multi-line `-- ...` block explaining the threat model (HARDEN-06), the per-IP and per-email thresholds, the silent-vs-explicit breach contracts, and why the function is `service_role`-only.

### `SECURITY DEFINER` with locked `search_path`
**Source:** `supabase/migrations/010_prevent_last_owner_deletion.sql:21-23`
**Apply to:** `fn_check_and_consume_rate_limit` in `011_auth_rate_limits.sql`. Always `language plpgsql`, `security definer`, `set search_path = public`. Mirrors migration 010 exactly.

### RLS deny-by-default + service-role write
**Source:** `supabase/migrations/008_answer_options_public_view.sql:12-15`
**Apply to:** `auth_rate_limits` table. `enable row level security` with no policies for `authenticated`. Service-role bypass is the only write path (RPC is `EXECUTE`-granted to `service_role` only).

## No Analog Found

None — every Phase 2 file has a direct or close analog in the codebase.

## Metadata

**Analog search scope:**
- `src/lib/` (all subdirs) — pure helpers, validators, scoring
- `src/app/(dashboard)/admin/` — admin-gated server actions
- `src/app/(auth)/` and `src/app/auth/` — public auth actions
- `src/components/` — RTL test exemplar (`certificates/print-button.test.tsx`)
- `supabase/migrations/` — SQL migration shape, RPC pattern, RLS pattern

**Files scanned:** ~25 (analogs read in full or by targeted offset)

**Pattern extraction date:** 2026-05-01
