# Phase 6: Pilot Cohort Setup - Discussion Log

> Audit trail only. Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 6-Pilot Cohort Setup
**Areas discussed:** Cohort model, admin workflow, invite handling, verification

---

## Cohort Model

| Option | Description | Selected |
|--------|-------------|----------|
| Existing entities | Treat the pilot cohort as an operational view over users, invites, role groups, programs, and courses. | Yes |
| New cohort table | Add a durable cohort model now. | No |
| External spreadsheet tracker | Keep pilot state outside the app. | No |

**User's choice:** User asked to keep moving. Claude selected the smallest operational path that fits the roadmap and current codebase.
**Notes:** First pilot is internal and small. Role groups remain the access source of truth.

---

## Admin Workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Improve `/admin/users` | Build on the existing users, invites, resend, revoke, and edit-user surfaces. | Yes |
| New pilot module | Create a separate route for pilot cohort setup. | No |
| Documentation only | Leave UI unchanged and document the process. | No |

**User's choice:** User asked to continue without stopping. Claude selected reuse of existing admin surfaces.
**Notes:** This avoids a parallel admin model and keeps Phase 6 narrow.

---

## Invite Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Supabase invite flow | Continue using Supabase invite email and Google Workspace enrollment email. | Yes |
| Change email provider | Introduce a new email service or mailbox pattern. | No |
| Manual invite links | Generate links manually for the pilot. | No |

**User's choice:** Provider changes are already constrained by PROJECT.md and AGENTS.md. Claude selected the existing provider path.
**Notes:** Spending and provider changes require explicit approval.

---

## Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Focused tests plus browser proof | Unit or RTL for logic/rendering, Playwright only where flows change. | Yes |
| Browser only | Rely on manual or Playwright checks without regression tests. | No |
| Full production-only proof | Prove all changes with production writes only. | No |

**User's choice:** TDD is the repo default for meaningful changes.
**Notes:** Production disposable records are allowed by project policy, but local or non-production coverage should carry most regression proof.

## Claude's Discretion

- Decide whether the plan needs a small row-shaping helper.
- Decide whether Phase 6 should be one plan or split into UI, action, and verification plans.

## Deferred Ideas

- Bulk spreadsheet import.
- Durable cohort table.
- Sandra Practice role-play embed.
