# Phase 1: Auth and Access Hardening - Pattern Map

**Mapped:** 2026-04-30
**Files analyzed:** 13 (10 modified, 3 created)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/(dashboard)/admin/reports/page.tsx` | server-page (admin) | request-response | `src/app/(dashboard)/admin/users/[userId]/edit/page.tsx` (any admin page that calls `requireAdmin()`) — closest sibling pattern | role-match |
| `src/app/(dashboard)/admin/reports/users/[userId]/page.tsx` | server-page (admin) | request-response | same as above | role-match |
| `src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx` | server-page (admin) | request-response | same as above | role-match |
| `src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx` | server-page (admin) | request-response | same as above | role-match |
| `src/app/auth/callback/route.ts` | route-handler | request-response | self (existing `applyInvite`) | exact |
| `src/app/(auth)/login/page.tsx` | client-page (form render) | request-response | self (existing `urlError === "invite_failed"` branch) | exact |
| `src/app/(dashboard)/admin/users/page.tsx` | server-page (admin) | CRUD | self (existing pending-invites table) | exact |
| `src/app/(dashboard)/admin/users/actions.ts` | server-action | CRUD | self (`inviteUser` is the precedent for "mint token + send email") | exact |
| `src/app/(dashboard)/admin/users/resend-invite-button.tsx` (new) | client-component | event-driven | `src/app/(dashboard)/admin/users/revoke-invite-button.tsx` | exact |
| `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` | server-action | CRUD | self (existing `deleteUser` + `inviteUser`'s `createAdminClient` pattern) | exact |
| `supabase/migrations/008_user_delete_cascade.sql` (new) | migration | schema | `supabase/migrations/001_initial_schema.sql` lines 39-43 (FK style) | role-match |
| `supabase/migrations/009_answer_options_public_view.sql` (new) | migration | schema/RLS | `supabase/migrations/003_rls_policies.sql` lines 162-177 (answer_options policies); `006_storage_content_bucket.sql` lines 36-47 (admin/learner split) | role-match |
| `src/app/(dashboard)/lessons/[lessonId]/page.tsx` | server-page (learner) | request-response | self (existing line 222-234 `answer_options` select) | exact |
| `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts` | server-action | CRUD | self (existing line 80-95 `answer_options` select); `inviteUser` for the `createAdminClient` try/catch | exact |

## Pattern Assignments

### `src/app/(dashboard)/admin/reports/**/page.tsx` — HARDEN-01 (server-page, request-response)

**Analog:** `src/app/(dashboard)/admin/layout.tsx` (the canonical `requireAdmin()` call site) and the existing report files themselves (only the guard line is added; the rest of the file is unchanged).

**Required imports added at top of each file:**
```typescript
import { requireAdmin } from "@/lib/auth/guard";
```
Path alias `@/lib/auth/guard` matches `src/app/(dashboard)/admin/users/actions.ts:7` import style.

**Guard pattern** (copy from `src/app/(dashboard)/admin/layout.tsx:8`):
```typescript
await requireAdmin();
```

**Where to put it** — first statement inside the default-exported async function, before `await params` is awaited and before any Supabase client is created. Example shape for `src/app/(dashboard)/admin/reports/page.tsx`:
```typescript
export default async function AdminReportsPage() {
  await requireAdmin();
  const supabase = await createClient();
  // ...existing body unchanged
}
```

For `[userId]/page.tsx`, `[courseId]/page.tsx`, `[programId]/page.tsx` (param pages), the pattern is:
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

**Why `requireAdmin()` not `getAuthedProfile()`** — `requireAdmin` already handles both branches via `redirect()`:
- Unauthenticated → `redirect("/login")` (returns 307)
- Authenticated learner → `redirect("/dashboard")` (returns 307)

This is what the regression tests in HARDEN-01 acceptance criteria assert ("403 or redirects to /login"). Source: `src/lib/auth/guard.ts:31-38`.

**Anti-pattern to avoid** — do NOT add a custom 403 response. The codebase convention is `redirect()` from server components, never `return new Response(..., { status: 403 })`.

---

### `src/app/auth/callback/route.ts` — HARDEN-02 (route-handler, request-response)

**Analog:** self (existing `applyInvite` function lines 52-97 plus the existing `?error=invite_failed` redirect at line 24 and 30).

**Existing precedent for error redirect** (verbatim, line 22-25):
```typescript
if (!code) {
  return NextResponse.redirect(`${origin}/login?error=invite_failed`);
}
```

**Existing invite lookup block** (verbatim, line 68-73 — this is what the expiry check is added to):
```typescript
const { data: invite } = await admin
  .from("invites")
  .select("id, system_role, role_group_ids, accepted_at")
  .eq("token", token)
  .maybeSingle();
if (!invite || invite.accepted_at) return;
```

**Pattern to add** — extend the select to include `expires_at`, return early with redirect when expired. The `applyInvite` helper currently returns `void`; per D-02 it must signal the expired state up to the caller so the caller can redirect. Two compatible shapes:

Option A — change `applyInvite` to return a discriminated union:
```typescript
type ApplyResult = { ok: true } | { ok: false; reason: "expired" };

async function applyInvite({ userId, token }: { userId: string; token: string }): Promise<ApplyResult> {
  // ...existing admin client setup
  const { data: invite } = await admin
    .from("invites")
    .select("id, system_role, role_group_ids, accepted_at, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!invite || invite.accepted_at) return { ok: true };
  if (new Date(invite.expires_at as string) <= new Date()) {
    return { ok: false, reason: "expired" };
  }
  // ...existing role-apply body unchanged
  return { ok: true };
}
```

And in the `GET` handler:
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

**Convention match** — discriminated union with `{ ok: true } | { ok: false; reason: ... }` matches the project-wide server-action pattern from CONVENTIONS.md ("Discriminated unions use a literal `ok` field for narrowing").

**Comment style** — match the existing JSDoc on `applyInvite` (lines 47-51) when annotating the new branch. Inline rationale comment example:
```typescript
// D-02: refuse expired invites before applying any role assignment.
// Expired tokens redirect the user back to /login with a dedicated error code.
```

---

### `src/app/(auth)/login/page.tsx` — HARDEN-02 (client-page, request-response)

**Analog:** self (existing `urlError === "invite_failed"` branch at line 51).

**Existing pattern verbatim** (lines 49-53):
```typescript
const errorMessage =
  actionError ??
  (urlError === "invite_failed"
    ? "Invite link couldn't be verified. Ask an admin to resend it."
    : null);
```

**Pattern to extend** — add a second branch for `invite_expired`. Per D-01 the copy must be distinct ("This invite link has expired. Ask your admin to send you a fresh one."):
```typescript
const errorMessage =
  actionError ??
  (urlError === "invite_failed"
    ? "Invite link couldn't be verified. Ask an admin to resend it."
    : urlError === "invite_expired"
    ? "This invite link has expired. Ask your admin to send you a fresh one."
    : null);
```

**Why ternary chain not switch** — matches the existing single-line ternary style in this file. Keep the chain flat for two branches; if a third URL error code lands later, refactor to a lookup map then.

**Suspense boundary** — already in place (lines 33-35); no changes needed there. The `useSearchParams()` call on line 45 already surfaces the `?error=` value.

---

### `src/app/(dashboard)/admin/users/page.tsx` — HARDEN-02 admin list (server-page, CRUD)

**Analog:** self (existing pending-invites table lines 129-171).

**Existing query — does not need changes** (lines 32-35) already selects `expires_at`:
```typescript
supabase
  .from("invites")
  .select("id, email, system_role, role_group_ids, created_at, accepted_at, expires_at")
  .order("created_at", { ascending: false }),
```

**Existing expiry display** (lines 151, 158-160):
```typescript
const expires = new Date(i.expires_at as string);
// ...
<TableCell className="text-muted-foreground text-xs">
  in {formatDistanceToNow(expires)}
</TableCell>
```

**Pattern to extend** — flag expired invites visually and add Resend button alongside Revoke. Compute expired state in the row map and switch the badge/copy:

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

**Why `Badge variant="destructive"` for the expired state** — matches the existing `Badge` usage on line 89-91 of this same file (already an established variant).

**Discretion zone** (per CONTEXT.md `## Claude's Discretion`) — exact wording of the badge label and the button copy ("Resend" vs "Send fresh invite") is the planner/executor's choice.

---

### `src/app/(dashboard)/admin/users/resend-invite-button.tsx` (new) — HARDEN-02 (client-component, event-driven)

**Analog:** `src/app/(dashboard)/admin/users/revoke-invite-button.tsx` (verbatim — copy the file structure and rename).

**Source file verbatim** (lines 1-29):
```typescript
"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { revokeInvite } from "./actions";

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await revokeInvite(inviteId);
          if (!result.ok) toast.error(result.error);
          else toast.success("Invite revoked.");
        });
      }}
    >
      {pending ? "..." : "Revoke"}
    </Button>
  );
}
```

**Adapt for resend** — same shape, swap the action name, error/success copy:
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

---

### `src/app/(dashboard)/admin/users/actions.ts` — HARDEN-02 new `resendInvite` action (server-action, CRUD)

**Analog:** `inviteUser` in the same file (lines 28-102) is the canonical "mint token, persist invite, call admin auth, send email" precedent.

**Imports already in file** (lines 1-16):
```typescript
"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderEnrollmentEmail } from "@/lib/email/enrollment";
```
All of these are reused by `resendInvite`. No new imports needed.

**`requireAdmin()` + admin-client try/catch pattern** (verbatim from lines 32-47):
```typescript
const inviter = await requireAdmin();
// ...
let admin;
try {
  admin = createAdminClient();
} catch (e) {
  const message = e instanceof Error ? e.message : "Admin client unavailable.";
  return {
    ok: false,
    error:
      message +
      " Add SUPABASE_SERVICE_ROLE_KEY to Vercel env vars and redeploy.",
  };
}
```

**Token mint + redirectTo build** (verbatim from lines 49, 68-70):
```typescript
const token = randomBytes(32).toString("base64url");
// ...
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
const redirectTo = `${appUrl.replace(/\/$/, "")}/auth/callback?invite_token=${encodeURIComponent(token)}`;
```

**`admin.auth.admin.inviteUserByEmail` call** (verbatim from lines 72-79):
```typescript
const { error: inviteError } =
  await admin.auth.admin.inviteUserByEmail(parsed.value.email, {
    redirectTo,
    data: {
      invited_by: inviter.email,
      system_role: parsed.value.system_role,
    },
  });
```

**Pattern to compose** — `resendInvite(inviteId)` looks up the existing invite, mints a fresh token + `expires_at`, updates the row, then re-fires the email with the new token. Discriminated-union return per CONVENTIONS.md:

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

**Decision per CONTEXT.md `## Claude's Discretion`** — default is "send a fresh email through the existing invite-email path" (the snippet above). Skip the enrollment email re-send (already sent at original invite); only the Supabase signup/recovery email needs to fire.

---

### `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` — HARDEN-03 (server-action, CRUD)

**Analog:** self — the existing `deleteUser` (lines 154-173) and the `createAdminClient` try/catch from `inviteUser` in `src/app/(dashboard)/admin/users/actions.ts:36-47`.

**Existing `deleteUser` verbatim** (lines 154-173):
```typescript
export async function deleteUser(userId: string): Promise<{
  ok: true;
} | { ok: false; error: string }> {
  const me = await requireAdmin();
  if (me.id === userId) {
    return { ok: false, error: "You can't delete yourself." };
  }
  // We only remove the public.profiles row + user_role_groups. The
  // auth.users row is left intact (the service role key is needed to
  // delete via auth.admin.deleteUser — do it from the Supabase dashboard
  // if you want the auth record gone).
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

**Pattern to apply** — replace the suspend body with a true delete using `admin.auth.admin.deleteUser`. Add the last-owner guard per D-06. Drop the obsolete inline comment about manual dashboard steps.

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
// ...

export async function deleteUser(userId: string): Promise<{
  ok: true;
} | { ok: false; error: string }> {
  const me = await requireAdmin();
  if (me.id === userId) {
    return { ok: false, error: "You can't delete yourself." };
  }

  const supabase = await createClient();

  // D-06: refuse to delete the last remaining owner.
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

  // Removing auth.users cascades to public.profiles (FK on delete cascade,
  // see migration 001). All user-scoped tables cascade off profiles.id via
  // migration 008.
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) return { ok: false, error: authErr.message };

  revalidatePath("/admin/users");
  return { ok: true };
}
```

**Why no manual `profiles` delete** — `profiles.id` already has `references auth.users(id) on delete cascade` (migration 001 line 17), so deleting the auth user cascades to the profile. Migration 008 (HARDEN-03) extends the cascade to user-scoped data tables.

**UI copy update reminder** — the existing confirm dialog in `user-edit-form.tsx:90-92` says "Suspend this user? ... auth account itself stays in Supabase". Since the action now actually deletes, the confirm copy and toast message ("User suspended.") need to be updated. This is in scope per the CONTEXT.md `## Specifics` note: "Renaming/clarifying the admin UI is fair game inside HARDEN-03".

---

### `supabase/migrations/008_user_delete_cascade.sql` (new) — HARDEN-03 (migration, schema)

**Analog:** `supabase/migrations/001_initial_schema.sql` lines 39-43 (FK definition style with `on delete cascade`).

**Important finding** — auditing migration 001, every user-scoped FK to `public.profiles(id)` already declares `on delete cascade`:
- `user_role_groups.user_id` (line 40)
- `assignment_submissions.user_id` (line 216)
- `user_block_progress.user_id` (line 229)
- `user_lesson_completions.user_id` (line 237)
- `user_quiz_attempts.user_id` (line 245)
- `user_course_resume.user_id` (line 258)
- `certificates.user_id` (line 268)
- `program_certificates.user_id` (line 278)
- `profiles.id → auth.users(id)` (line 17)

The `assignment_submissions.reviewed_by` (line 222), `invites.invited_by` (line 292), and `audit_log.user_id` (line 300) FKs are deliberately `on delete set null` (preserving the audit/history record when the actor is deleted).

**Decision required from planner** — given the schema already cascades user-scoped data, migration 008 is largely a NO-OP / verification. The planner has two paths:

1. **Verify-and-document migration** — emit a single comment noting the audit was performed, no DDL needed. This keeps the migration file as the historical anchor for HARDEN-03 even though no schema change ships.
2. **Defensive idempotent migration** — re-declare the cascade FKs using `alter table ... drop constraint ... add constraint ...` to guarantee the rule across any drifted preview/branch projects.

The CONCERNS.md recommendation ("Use `createAdminClient()` to call `admin.auth.admin.deleteUser`") suggests the migration was never the gating concern — the `deleteUser` action was. Path 1 is the lowest-risk default; surface this to Jarrad before authoring DDL.

**FK declaration style to match** (verbatim from migration 001 line 40):
```sql
user_id uuid not null references public.profiles(id) on delete cascade,
```

**Idempotent re-declaration template** if path 2 is chosen:
```sql
alter table public.user_role_groups
  drop constraint if exists user_role_groups_user_id_fkey,
  add constraint user_role_groups_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;
```
Note that constraint names follow Postgres's default `<table>_<column>_fkey` convention; verify with `\d public.user_role_groups` in the prod project before authoring.

**Header comment style** (verbatim from migration 001 line 1, 003 line 1, 004 line 1, 006 line 1):
```sql
-- BMH Training Platform — User Delete Cascade Verification
```
Note: the existing files still say "BMH Training Platform" (the rename is recent; new migrations may say "BMH Institute" — discretion zone).

---

### `supabase/migrations/009_answer_options_public_view.sql` (new) — HARDEN-04 (migration, schema/RLS)

**Analog:** `supabase/migrations/003_rls_policies.sql` lines 162-177 (existing answer_options policies, verbatim below) and `006_storage_content_bucket.sql` lines 36-47 (admin/learner split as `to authenticated`).

**Existing answer_options policies verbatim** (003 lines 162-177):
```sql
-- answer_options
-- Learners can read options (required to render choices). The is_correct flag should be
-- stripped at the API layer or via a view before exposure. Scoring runs server-side.
create policy answer_options_learner_read on public.answer_options
  for select using (
    exists (
      select 1 from public.questions q
      join public.lessons l on l.quiz_id = q.quiz_id
      join public.modules m on m.id = l.module_id
      where q.id = answer_options.question_id
        and public.fn_user_has_course_access(auth.uid(), m.course_id)
    )
  );
create policy answer_options_admin_all on public.answer_options
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
```

**Migration outline per D-07/D-08:**
```sql
-- BMH Institute — answer_options public view (HARDEN-04)
-- Hides is_correct from learner sessions. Admin policy on the underlying
-- table is preserved for the lesson editor; service-role bypass is
-- preserved for server-side scoring (createAdminClient).

create or replace view public.answer_options_public as
  select id, question_id, option_text, sort_order
  from public.answer_options;

alter view public.answer_options_public
  set (security_invoker = on);

-- Drop the learner SELECT policy on the underlying table; learners now
-- read via the view. The admin policy stays (admin/owner sessions still
-- read the full row including is_correct from the lesson editor).
drop policy if exists answer_options_learner_read on public.answer_options;

-- Grant SELECT on the view to authenticated; the underlying table's
-- admin RLS policy will gate the view's access to is_correct-free
-- columns when security_invoker checks the underlying RLS. To allow
-- learner access through the view we add a permissive view policy or
-- equivalent approach — see implementation note.
grant select on public.answer_options_public to authenticated;
revoke select on public.answer_options from authenticated;
```

**Implementation note for the planner** — Postgres views with `security_invoker = on` enforce the underlying table's RLS against the calling user. After we revoke SELECT on the underlying table from `authenticated`, learners querying the view will be blocked by the same RLS. Two compatible resolutions:

1. **`security_invoker = off`** (definer mode) — view runs as the view owner (typically `postgres`). This bypasses underlying RLS entirely; access control collapses to the GRANT on the view. Simpler and matches D-07/D-08's intent literally. Risk: any future column added to `answer_options` is exposed to all authenticated users via the view unless explicitly excluded — keep the SELECT list pinned to the four whitelisted columns.

2. **Keep underlying learner SELECT policy + add column-level filter** — cannot do column-level RLS in Postgres directly; would require a SECURITY DEFINER function instead of a view. Out of scope per CONTEXT.md `## Deferred` (the SECURITY DEFINER RPC approach was explicitly rejected).

Default to path 1 (definer view). The migration becomes:
```sql
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

**Verify** — admin lesson edit page (`src/app/(dashboard)/admin/lessons/[lessonId]/edit/page.tsx`) reads `is_correct` via the admin session (CONTEXT.md `## Specifics`). Since `answer_options_admin_all` policy survives this migration unchanged, that page still works. The integration test inventory should assert this explicitly.

**Index preservation** — `idx_answer_options_question on public.answer_options (question_id, sort_order)` (`004_indexes.sql:24`) continues to serve view queries since the view is a thin projection. No new index needed.

---

### `src/app/(dashboard)/lessons/[lessonId]/page.tsx` — HARDEN-04 learner read (server-page, request-response)

**Analog:** self — the existing `answer_options` select in the questions query at lines 222-234.

**Existing query verbatim** (lines 222-234):
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

**Pattern to change** — replace the embedded `answer_options(...)` join with a join against the new view. Two equivalent approaches:

1. **Two queries, in-process join** (cleaner; matches the codebase's preference for explicit data flow):
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
// Group options by question_id and stitch in.
```

2. **PostgREST embedded join from the view** (preserves the existing shape):
```typescript
supabase
  .from("questions")
  .select(
    `
    id,
    question_text,
    question_type,
    sort_order,
    answer_options_public ( id, option_text, sort_order )
  `,
  )
  .eq("quiz_id", quizId)
  .order("sort_order"),
```
This requires that PostgREST recognises the FK from `answer_options_public.question_id` to `questions.id`. Since views are not first-class FK targets in PostgREST, path 2 may fail with a "Could not find a relationship" error. Default to path 1 to avoid the PostgREST schema-cache surprise.

**Comment** — keep or update the line-220 inline comment ("Explicitly do NOT select is_correct so it never reaches the browser.") to: `// Read from answer_options_public view; is_correct is not exposed to learner sessions (HARDEN-04).`

**Existing `toOptionList` helper** (lines 376-386) is unchanged — it operates on whichever option rows are passed in.

---

### `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts` — HARDEN-04 scoring read (server-action, CRUD)

**Analog:** self — the existing `answer_options` join at lines 80-95, plus the `createAdminClient` try/catch from `inviteUser`.

**Existing query verbatim** (lines 80-95):
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
if (qErr || !rawQuestions) {
  return { ok: false, error: qErr?.message ?? "Questions not found." };
}
```

**Pattern to apply per D-10** — switch ONLY the `is_correct`-bearing query to the admin client. Other queries in this file (the `quizzes` lookup at lines 35-39, the `user_quiz_attempts` lookup at lines 47-50, and the `user_quiz_attempts` insert at lines 116-129) stay on the learner client.

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
// ...

// Inside submitQuizAttempt, replace the lines 80-98 block:

let admin;
try {
  admin = createAdminClient();
} catch (e) {
  const message = e instanceof Error ? e.message : "Admin client unavailable.";
  return { ok: false, error: message };
}

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

**Why service-role works** — service-role bypasses RLS entirely (`src/lib/supabase/admin.ts:1-11` JSDoc warning), so the `revoke select on public.answer_options from authenticated` from migration 009 doesn't block this read. The user identity check (`auth.getUser()` at line 30-33) already gated entry; the admin client is only used for the scoring lookup, after eligibility checks pass. This is the same trust shape used by `applyInvite` in the callback route.

**Defense-in-depth comment** to add inline (matches the line-44 comment style):
```typescript
// HARDEN-04: is_correct is RLS-revoked from learner sessions, so the scoring
// fetch uses the service-role client. Eligibility checks above already ran
// against the learner's session.
```

**Scoring logic untouched per D-10** — `scoreQuizAttempt` in `src/lib/quizzes/score.ts` is a pure function consuming `correctOptionIds`; no changes.

---

## Shared Patterns

### Authentication Guard
**Source:** `src/lib/auth/guard.ts:31-38`
**Apply to:** All four HARDEN-01 report pages; existing `requireAdmin()` calls in `actions.ts` files for HARDEN-02 (`resendInvite`) and HARDEN-03 (`deleteUser`)
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
First line of every admin page function and every admin server action.

### Discriminated-Union Server-Action Return
**Source:** `src/app/(dashboard)/admin/users/actions.ts:178-187` (`revokeInvite`); `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts:154-156` (`deleteUser`); CONVENTIONS.md
**Apply to:** New `resendInvite` action (HARDEN-02); modified `deleteUser` action (HARDEN-03); `applyInvite` helper return type if refactored (HARDEN-02)
```typescript
{ ok: true } | { ok: false; error: string }
```
Or richer:
```typescript
{ ok: true; ...payload } | { ok: false; error: string; fieldErrors?: ... }
```
Server actions never throw; they return `{ ok: false, error }` and the client uses `toast.error(result.error)`.

### Admin Client Acquisition
**Source:** `src/app/(dashboard)/admin/users/actions.ts:36-47`
**Apply to:** `resendInvite` (HARDEN-02), `deleteUser` after `auth.admin.deleteUser` (HARDEN-03), `submitQuizAttempt` for the is_correct fetch (HARDEN-04)
```typescript
let admin;
try {
  admin = createAdminClient();
} catch (e) {
  const message = e instanceof Error ? e.message : "Admin client unavailable.";
  return { ok: false, error: message };
}
```
Always wrap the `createAdminClient()` call in try/catch — it throws when env vars are missing (`src/lib/supabase/admin.ts:14-18`). Always destructure `e instanceof Error` to extract the message.

### `revalidatePath` After Mutation
**Source:** `src/app/(dashboard)/admin/users/actions.ts:100, 185, 204, 233-234`; CONVENTIONS.md ("`revalidatePath` called at the end of every mutating server action before `redirect` or returning `{ ok: true }`")
**Apply to:** `resendInvite` (HARDEN-02), updated `deleteUser` (HARDEN-03)
```typescript
revalidatePath("/admin/users");
return { ok: true };
```
For `deleteUser` also call `revalidatePath("/dashboard")` if the deleted user's existence affected the deleter's view; in this codebase the standing pattern is just `/admin/users`.

### Error Redirect From Route Handler
**Source:** `src/app/auth/callback/route.ts:24, 30`
**Apply to:** New `invite_expired` branch (HARDEN-02)
```typescript
return NextResponse.redirect(`${origin}/login?error=invite_expired`);
```
Always use the `origin` from `request.nextUrl`, never hard-code the host. The error code is consumed by `src/app/(auth)/login/page.tsx` via `useSearchParams().get("error")`.

### URL Error Code Rendering
**Source:** `src/app/(auth)/login/page.tsx:49-53`
**Apply to:** New `invite_expired` branch (HARDEN-02)
```typescript
const errorMessage =
  actionError ??
  (urlError === "invite_failed"
    ? "Invite link couldn't be verified. Ask an admin to resend it."
    : urlError === "invite_expired"
    ? "This invite link has expired. Ask your admin to send you a fresh one."
    : null);
```

### Migration File Naming
**Source:** existing `supabase/migrations/00N_name.sql` history; CONTEXT.md `## Claude's Discretion`
**Apply to:** HARDEN-03 cascade (008), HARDEN-04 view (009)
- Current head: `007_storage_submissions_bucket.sql`
- Phase 1 allocates `008_user_delete_cascade.sql` and `009_answer_options_public_view.sql`
- Header comment style: `-- BMH Institute — <Subject>`
- All identifiers lowercase, snake_case (matches 001-007)

### Test File Co-Location
**Source:** CONVENTIONS.md, every existing `*.test.ts` pair
**Apply to:** Every plan's failing-tests commit (TDD per AGENTS.md)
- Unit test next to subject: `foo.ts` + `foo.test.ts` in the same directory
- Integration test: `*.integration.test.ts` (excluded from `npm run test`, run via `npm run test:integration`)
- Vitest: `import { describe, expect, it } from "vitest";` — see `src/lib/quizzes/attempts.test.ts:1`

**Per HARDEN acceptance criteria the following tests are mandatory:**
- HARDEN-01: regression test asserts learner-session fetch returns 403 or `redirect("/login")`. Likely lives as a Playwright e2e write-path test (per TEST-03 deferred but the regression itself is in scope here) OR as a Vitest unit on a small `requireAdmin`-wrapping helper. Recommend Vitest unit + e2e smoke.
- HARDEN-02: unit test for the callback covering an expired invite and an active invite. Co-locate as `src/app/auth/callback/route.test.ts`. Will need to mock `createAdminClient` and `createClient`.
- HARDEN-03: test asserts a deleted user cannot re-authenticate. This requires a real Supabase project (`*.integration.test.ts`). Vitest unit can cover the `deleteUser` action with mocked clients (assert `auth.admin.deleteUser` is called).
- HARDEN-04: test asserts a learner anon-key query returns no `is_correct` field. Must be `*.integration.test.ts` against the real Supabase project; Vitest unit cannot exercise RLS.

### Comment Style for HARDEN Rationale
**Source:** `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts:44-45`; CONVENTIONS.md ("Implementation rationale for non-obvious decisions: inline `//` comments")
**Apply to:** every change touched by this phase
```typescript
// Defense in depth: re-check eligibility server-side so a stale or
// manipulated client can't bypass max_attempts / cooldown.
```
For HARDEN changes, prefix with the requirement code:
```typescript
// HARDEN-04: is_correct is RLS-revoked from learner sessions; service-role
// client bypasses RLS for the scoring fetch only.
```
And per CONTEXT.md writing style: no em dashes, minimal commas.

---

## No Analog Found

None — every file in this phase has a direct or near-direct in-codebase analog.

The migration files (008, 009) lean on patterns from 001 (FK style) and 003 (RLS style) but introduce constructs not yet present in the codebase:
- `008` introduces no new construct (FK cascade is already the dominant style); it is a verification or no-op migration.
- `009` introduces the first `create view`, the first `grant ... to authenticated`, and the first `revoke ... from authenticated`. There is no in-codebase precedent for these statements; the planner should explicitly call out the syntax in the test inventory (Postgres docs are the source of truth).

## Metadata

**Analog search scope:**
- `src/app/(dashboard)/admin/**`
- `src/app/auth/callback/route.ts`
- `src/app/(auth)/login/**`
- `src/app/(dashboard)/lessons/[lessonId]/**`
- `src/lib/auth/**`
- `src/lib/supabase/**`
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/003_rls_policies.sql`
- `supabase/migrations/004_indexes.sql`
- `supabase/migrations/006_storage_content_bucket.sql`

**Files scanned:** 14 source/migration files, 3 test files, 2 vitest configs.

**Pattern extraction date:** 2026-04-30

---

*Phase: 01-auth-and-access-hardening*
*Patterns mapped: 2026-04-30*
