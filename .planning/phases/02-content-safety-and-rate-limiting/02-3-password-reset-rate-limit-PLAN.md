---
phase: 02-content-safety-and-rate-limiting
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/011_auth_rate_limits.sql
  - src/lib/rate-limit/ip.ts
  - src/lib/rate-limit/ip.test.ts
  - src/lib/rate-limit/check.ts
  - src/lib/rate-limit/check.test.ts
  - src/lib/rate-limit/check.integration.test.ts
  - src/app/(auth)/forgot-password/actions.ts
  - src/app/(auth)/forgot-password/actions.test.ts
  - src/app/auth/set-password/actions.ts
  - src/app/auth/set-password/actions.test.ts
autonomous: true
requirements:
  - HARDEN-06
must_haves:
  truths:
    - auth_rate_limits stores counters by key_type, key_value, and window_start with RLS enabled and no learner policies
    - fn_check_and_consume_rate_limit increments atomically and returns allowed plus retry_after_seconds
    - Only service_role can execute fn_check_and_consume_rate_limit
    - extractClientIp uses the first x-forwarded-for entry, then x-real-ip, then x-vercel-forwarded-for, then a stable local fallback
    - checkAndConsume calls the RPC through the service-role client and fails closed when the RPC errors
    - sendPasswordReset gates by IP and normalized email before resetPasswordForEmail
    - sendPasswordReset silently returns ok true on a rate-limit breach without calling Supabase auth
    - setPassword gates by IP and the authenticated user's normalized email before updateUser
    - setPassword returns a clear retry message on a rate-limit breach without calling Supabase auth.updateUser
    - Failing tests land in their own commit before the implementation commit (AGENTS.md)
  artifacts:
    - path: supabase/migrations/011_auth_rate_limits.sql
      provides: auth_rate_limits table, RLS, lookup index, and service-role-only RPC
      contains: fn_check_and_consume_rate_limit
    - path: src/lib/rate-limit/ip.ts
      provides: extractClientIp
      contains: x-forwarded-for
    - path: src/lib/rate-limit/check.ts
      provides: checkAndConsume helper
      contains: fn_check_and_consume_rate_limit
    - path: src/lib/rate-limit/check.integration.test.ts
      provides: live Supabase integration coverage for the atomic RPC
      contains: auth_rate_limits
    - path: src/app/(auth)/forgot-password/actions.ts
      provides: silent forgot-password rate-limit gate before resetPasswordForEmail
      contains: checkAndConsume
    - path: src/app/auth/set-password/actions.ts
      provides: explicit set-password rate-limit gate before updateUser
      contains: Too many attempts
  key_links:
    - from: src/app/(auth)/forgot-password/actions.ts
      to: src/lib/rate-limit/check.ts
      via: two checkAndConsume calls before resetPasswordForEmail
      pattern: keyType ip, keyType email
    - from: src/app/auth/set-password/actions.ts
      to: src/lib/rate-limit/check.ts
      via: two checkAndConsume calls after getUser and before updateUser
      pattern: retryAfterSeconds
    - from: src/lib/rate-limit/check.ts
      to: supabase/migrations/011_auth_rate_limits.sql
      via: service-role rpc call
      pattern: fn_check_and_consume_rate_limit
---

# Plan 02-3: Password Reset Rate Limit

<objective>
Close HARDEN-06. Add the Postgres-backed rate-limit table and RPC, create a small rate-limit helper module, and gate both forgot-password and set-password before any Supabase auth mutation. The forgot-password breach response is silent success to preserve enumeration resistance. The set-password breach response is explicit because the user already has a recovery session.

Purpose: Today `src/app/(auth)/forgot-password/actions.ts` calls `resetPasswordForEmail` on every valid email submission, and `src/app/auth/set-password/actions.ts` calls `updateUser` on every valid password submission from a recovery session. Automated requests can burn Supabase auth quota and create noisy email or password-reset traffic. CONTEXT.md D-C1 and D-D1 lock durable Postgres counters with two independent gates: 5 requests per IP per 15 minutes and 3 requests per email per 60 minutes.

Output:
- `supabase/migrations/011_auth_rate_limits.sql` with `auth_rate_limits`, RLS, lookup index, and `fn_check_and_consume_rate_limit`.
- `src/lib/rate-limit/ip.ts` and `src/lib/rate-limit/check.ts` plus unit and integration tests.
- `sendPasswordReset` gates before `resetPasswordForEmail` and silently succeeds on breach.
- `setPassword` gates before `updateUser` and returns `Too many attempts. Try again in N minutes.` on breach.
- Two commits: failing tests, then implementation.
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
@.planning/phases/02-content-safety-and-rate-limiting/02-CONTEXT.md
@.planning/phases/02-content-safety-and-rate-limiting/02-RESEARCH.md
@.planning/phases/02-content-safety-and-rate-limiting/02-PATTERNS.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/TESTING.md
@AGENTS.md
@src/app/(auth)/forgot-password/actions.ts
@src/app/auth/set-password/actions.ts
@src/lib/supabase/admin.ts
@supabase/migrations/010_prevent_last_owner_deletion.sql

<interfaces>
Current forgot-password action:
```typescript
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

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

Current set-password action:
```typescript
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

Locked thresholds:
```typescript
const IP_THRESHOLD = 5;
const IP_WINDOW_SECONDS = 15 * 60;
const EMAIL_THRESHOLD = 3;
const EMAIL_WINDOW_SECONDS = 60 * 60;
```

Rate-limit helper interface:
```typescript
export type RateLimitKeyType = "ip" | "email";

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export async function checkAndConsume(input: {
  keyType: RateLimitKeyType;
  keyValue: string;
  threshold: number;
  windowSeconds: number;
}): Promise<RateLimitResult>;
```

IP extractor interface:
```typescript
export function extractClientIp(headersList: Headers): string;
```

RPC shape:
```sql
create or replace function public.fn_check_and_consume_rate_limit(
  p_key_type public.auth_rate_limit_key_type,
  p_key_value text,
  p_threshold integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
...
$$;
```
</interfaces>
</context>

<test_inventory>
Per AGENTS.md the test inventory is enumerated and reviewable before any tests or production code are written. Files, scope, and assertions:

File A: `src/lib/rate-limit/ip.test.ts` (NEW; Vitest unit)

`describe("extractClientIp")`:
1. `it("uses the first x-forwarded-for entry")` - `x-forwarded-for` is `203.0.113.1, 198.51.100.2`; returns `203.0.113.1`.
2. `it("falls back to x-real-ip")` - no forwarded header, `x-real-ip` present; returns it.
3. `it("falls back to x-vercel-forwarded-for")` - only Vercel header present; returns it.
4. `it("returns a stable local fallback when no IP headers are present")` - returns `127.0.0.1`.

File B: `src/lib/rate-limit/check.test.ts` (NEW; Vitest unit with mocked admin client)

`describe("checkAndConsume")`:
1. `it("calls fn_check_and_consume_rate_limit with the key, threshold, and window")` - asserts the RPC name and params match.
2. `it("normalizes the RPC row into camelCase")` - RPC returns `{ allowed: false, retry_after_seconds: 120 }`; helper returns `{ allowed: false, retryAfterSeconds: 120 }`.
3. `it("fails closed when the RPC returns an error")` - helper returns `{ allowed: false, retryAfterSeconds: windowSeconds }`.
4. `it("fails closed when the RPC returns no row")` - helper returns `{ allowed: false, retryAfterSeconds: windowSeconds }`.

File C: `src/lib/rate-limit/check.integration.test.ts` (NEW; Vitest integration, gated by TEST_SUPABASE_* env vars)

`describe("checkAndConsume integration (HARDEN-06)")`:
1. `it("allows requests up to the threshold and rejects the next one")` - calls the helper with a throwaway IP key and threshold 2, asserts first two calls allowed and third denied.
2. `it("tracks email and ip keys independently")` - same key value with different key types does not share counts.
3. `it("returns a positive retryAfterSeconds when denied")` - denied result includes retryAfterSeconds greater than 0.

File D: `src/app/(auth)/forgot-password/actions.test.ts` (NEW or MODIFY; Vitest unit)

`describe("sendPasswordReset rate limit (HARDEN-06)")`:
1. `it("returns an email-required error before rate-limit checks")` - empty email returns existing error and no gate calls.
2. `it("checks the IP gate before resetPasswordForEmail")` - valid email calls `checkAndConsume` for keyType `ip` first.
3. `it("checks the normalized email gate before resetPasswordForEmail")` - email is lowercased and trimmed before the email gate.
4. `it("silently succeeds and skips Supabase auth when the IP gate denies")` - returns `{ ok: true }`; resetPasswordForEmail not called.
5. `it("silently succeeds and skips Supabase auth when the email gate denies")` - returns `{ ok: true }`; resetPasswordForEmail not called.
6. `it("calls resetPasswordForEmail when both gates allow")` - existing redirectTo behavior is preserved.

File E: `src/app/auth/set-password/actions.test.ts` (NEW or MODIFY; Vitest unit)

`describe("setPassword rate limit (HARDEN-06)")`:
1. `it("returns password validation errors before rate-limit checks")` - short password and mismatch paths do not call gates.
2. `it("returns the existing session-expired error before rate-limit checks when no user exists")` - no user path remains unchanged.
3. `it("checks the IP gate before updateUser")` - valid session calls IP gate before updateUser.
4. `it("checks the authenticated user's normalized email before updateUser")` - email key is lowercased and trimmed.
5. `it("returns an explicit retry error and skips updateUser when the IP gate denies")` - error includes rounded minutes.
6. `it("returns an explicit retry error and skips updateUser when the email gate denies")` - error includes rounded minutes.
7. `it("calls updateUser and redirects when both gates allow")` - existing success flow remains.

Total Plan 02-3 inventory: 24 new test cases (4 IP unit, 4 helper unit, 3 integration, 6 forgot-password unit, 7 set-password unit). Failing tests land in commit 1; implementation lands in commit 2.
</test_inventory>

<tasks>
1. Create the failing tests from the inventory above.
2. Add `supabase/migrations/011_auth_rate_limits.sql`.
3. Implement `extractClientIp` and `checkAndConsume`.
4. Wire `sendPasswordReset` with silent breach handling.
5. Wire `setPassword` with explicit breach handling.
6. Run targeted tests, then `npm run verify`.
7. Write `02-3-SUMMARY.md` after execution and update planning status.
</tasks>

<acceptance>
- `npm run test -- src/lib/rate-limit/ip.test.ts src/lib/rate-limit/check.test.ts 'src/app/(auth)/forgot-password/actions.test.ts' src/app/auth/set-password/actions.test.ts` passes.
- `npm run test:integration -- src/lib/rate-limit/check.integration.test.ts` passes when `.env.test.local` is populated, or skips cleanly when env vars are absent.
- `npm run verify` passes.
- The migration grants RPC execute only to `service_role` and enables RLS on `auth_rate_limits`.
- No Supabase auth call runs after a denied gate.
</acceptance>
