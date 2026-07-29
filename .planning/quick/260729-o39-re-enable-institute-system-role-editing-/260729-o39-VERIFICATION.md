---
quick_task: 260729-o39
status: gaps_found
verified: 2026-07-29
---

# Verification

## Passed

- The per-user action persists role changes with changed or unchanged role-group
  membership through an exact role-only trusted write.
- The per-user action preserves the role-group RPC, email diffing, rollback
  behavior, and self-demotion error.
- Both actions reject real self-role changes and allow unchanged self roles.
- The standalone action requires a returned profile row.
- Typecheck, lint, unit, RTL, focused tests, diff checks, and Fallow are green.
- No migration file changed.
- No secret, credential, environment variable, or provider configuration
  changed.

## Gaps

- Hugo lifecycle operations can later replace the Institute-owned role with
  Hugo input or a stale grant role.
- Owner usability still requires a matching owner grant role.
- Role and role-group persistence remains two requests plus compensation, not
  one database transaction.
- Browser verification was not run. The preview can mutate the linked database,
  and this task did not authorize a disposable production profile or production
  role write.

## Verdict

Application regression coverage passes. Durable architecture acceptance remains
blocked by database contract gaps outside the no-migration scope.
