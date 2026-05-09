# Plan 07-3: Recovery Copy And Browser Verification

## Goal

Make common learner recovery paths visible and verify the learner onboarding flow in the browser.

## Scope

- Update profile and password recovery copy where needed.
- Add durable browser coverage only where it protects the learner flow.
- Record Phase 7 verification.

## Tasks

1. Review learner-facing copy on dashboard, profile, forgot-password, and set-password.
2. Adjust profile and recovery copy for plain language and discoverability.
3. Add or extend Playwright coverage for the learner onboarding dashboard flow if the existing seeded fixture can support it.
4. Run `npm run verify`.
5. Run local browser verification.
6. Update requirements, roadmap, state, and `07-VERIFICATION.md`.

## Acceptance

- Recovery paths are visible from normal learner surfaces.
- Browser verification confirms the learner can identify the first action and recovery options.
- GSD state marks Phase 7 complete only after tests and browser verification pass.
