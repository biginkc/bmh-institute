# Phase 1: Auth and Access Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 01-auth-and-access-hardening
**Areas discussed:** Expired-invite UX (HARDEN-02), Delete vs suspend semantics (HARDEN-03), answer_options view scope (HARDEN-04), Plan granularity

---

## Expired-invite UX (HARDEN-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit `invite_expired` message | New error code on /login with distinct copy; admin invite list flags expired with Resend | ✓ |
| Generic `invite_failed` | Reuse existing failure code for every failure mode | |
| Explicit message + auto-resend | Self-service "request a new invite" form on /login | |

**User's choice:** Explicit `invite_expired` message
**Notes:** Self-service request-new-invite path was rejected as scope creep — admin Resend is sufficient.

---

## Delete vs suspend semantics (HARDEN-03)

| Option | Description | Selected |
|--------|-------------|----------|
| True delete: remove auth.users + profile | Delete becomes permanent; suspend stays available via the edit form's status toggle | ✓ |
| Two-step destructive confirm | Same as option 1 plus an email-typing confirmation dialog | |
| Keep delete as suspend, rename only | Closes UX confusion but does NOT meet HARDEN-03 | |

**User's choice:** True delete

### Cascade follow-up

| Option | Description | Selected |
|--------|-------------|----------|
| Hard cascade: delete everything | FK ON DELETE CASCADE across user-scoped tables | ✓ |
| Soft cascade: keep records, set user_id NULL | Preserves audit history, requires defensive null checks downstream | |
| Block delete if records exist | Forces admin to suspend instead | |

**User's choice:** Hard cascade
**Notes:** Internal training context; no audit-preservation requirement so historical records can go with the user.

---

## answer_options view scope (HARDEN-04)

| Option | Description | Selected |
|--------|-------------|----------|
| View + admin-client scoring | `answer_options_public` view; REVOKE on table; scoring switches to admin client for is_correct fetch only | ✓ |
| Column-level GRANT/REVOKE | REVOKE SELECT (is_correct) on the table from authenticated; no view | |
| SECURITY DEFINER scoring RPC | Move scoring logic into Postgres function | |

**User's choice:** View + admin-client scoring
**Notes:** Scoring logic in `src/lib/quizzes/score.ts` stays a pure TS function — only the is_correct fetch in `quiz-actions.ts` swaps to the admin client.

---

## Plan granularity

| Option | Description | Selected |
|--------|-------------|----------|
| 4 parallel plans, one per HARDEN | File-disjoint, parallel waves, matches YOLO + coarse decision | ✓ |
| 2 grouped plans | Auth-surface + Account-and-answer-key | |
| 1 mega-plan | Single PLAN.md, sequential | |

**User's choice:** 4 parallel plans
**Notes:** `1-1 admin-route-guards`, `1-2 invite-expiry`, `1-3 user-deletion`, `1-4 answer-options-view`. Each carries its own test inventory + failing-tests commit + impl commit per the project's TDD-with-inventory rule.

---

## Claude's Discretion

- Exact wording of expired-invite UI copy and admin invite-list "expired" badge styling
- Whether the Resend control sends a fresh email (default) or only mints a new token + shows a copy-link
- Migration filename numbering (next free slot is `008_*`); planner allocates per plan

## Deferred Ideas

- `isAdminEmail` dead-code cleanup (`src/lib/auth/allowlist.ts`) — backlog tech debt
- `NEXT_PUBLIC_APP_URL` triple-fallback consolidation — backlog tech debt
- Self-service "request a new invite" form on /login — would be its own phase if revisited
- Moving the full scoring path into a SECURITY DEFINER RPC — explicitly rejected for HARDEN-04
