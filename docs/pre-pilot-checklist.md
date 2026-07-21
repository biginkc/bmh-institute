# Pre-pilot checklist

Use this checklist before granting Institute access to the internal pilot. Hugo
is the only identity system for sign-in; Institute grants authorization and
never creates an app password or sends an authentication email.

## Identity and production access

- [ ] `https://institute.bmhgroupkc.com` loads without a browser warning.
- [ ] Both active people have confirmed Hugo accounts.
- [ ] Each person's Hugo email exactly matches the canonical Institute email.
- [ ] Opening Institute from Hugo reaches the existing Institute user without a second password prompt.
- [ ] A direct visit to `/login` shows exactly one **Continue with Hugo** action.
- [ ] `/login` has no email field, password field, password-help link, or invite-acceptance action.
- [ ] The team understands that Hugo and Institute keep separate sessions; signing out of one does not automatically sign out of the other.

The production Playwright command proves only the public Hugo-only boundary and
unauthenticated route guards:

```bash
E2E_PROD_BASE_URL=https://institute.bmhgroupkc.com npm run test:prod
```

Authenticated read-only browser checks require a short-lived
`E2E_HUGO_STORAGE_STATE` captured after a real Hugo login. If no artifact is
provided, perform the authenticated checks manually in Chrome. Never substitute
an Institute password or service-role session.

## Required manual Hugo gate

- [ ] Jarrad enters the original Institute UID, owner role, profile, role groups, and learning records.
- [ ] The second active user enters the original Institute UID, assigned role, profile, role groups, and learning records for every authorized area.
- [ ] An isolated, unprovisioned Hugo user is denied and no Institute auth user, profile, membership, or content is created.
- [ ] A suspended Institute user is denied without a redirect loop.
- [ ] A formerly valid Institute password is rejected.
- [ ] Attempting Institute password recovery sends no Institute email and cannot establish a session.
- [ ] Signing out returns to the Hugo-only login surface.

These identity-linking and negative-access outcomes are manual Chrome gates.
They are not claimed by the public production-readiness workflow.

## Pilot authorization

- [ ] Open `/admin/users` with a real Hugo-authenticated admin session.
- [ ] Use **Grant Institute access** only for an exact canonical email.
- [ ] Confirm the action reports that no Institute password or authentication email was created.
- [ ] Each pilot learner has the intended system role and role groups.
- [ ] Each pilot learner is active and no learner remains in **Needs access**.
- [ ] Historical invite rows remain reference-only and are not treated as active Hugo invitations.
- [ ] Anyone returning from the historical account pool is added to Hugo with the same email before Institute access is reactivated.

The seeded nonproduction E2E suite proves passwordless grant-access behavior and
role-group correction against `bmh-institute-test`; it does not provision or
email a production identity.

## Learner onboarding and authorization

- [ ] The learner dashboard shows assigned programs, courses, and required lessons.
- [ ] Profile links to Hugo for account management.
- [ ] The learner can open an assigned course and content lesson.
- [ ] An unassigned learner cannot open the assigned course or lesson.
- [ ] The learner cannot open `/admin` or an admin reports route.

## Learning workflows

- [ ] The learner can submit a text assignment.
- [ ] An admin can request revision and approve a resubmission.
- [ ] The learner can upload a file assignment.
- [ ] Course and program certificates are issued after requirements are met.
- [ ] The certificate page opens.
- [ ] The Institute-to-Closer role-play embed opens for an authorized learner.

These write paths are automated only against the exact nonproduction test
project. Production acceptance uses existing authorized users and avoids
creating disposable production records.

## Learner monitoring

- [ ] `/admin/reports` opens.
- [ ] Learner monitoring and learner rollups are visible.
- [ ] **Needs access**, **Needs review**, and **Needs revision** links open the correct operator surfaces.
- [ ] A learner report opens.
- [ ] The CSV export link is visible.

## Cleanup and launch decision

- [ ] No production test user, course, lesson, quiz, assignment, or content block was created by the acceptance run.
- [ ] Any historical `PRD-READY-` or `PILOT-DRYRUN-` leftovers are handled separately with `docs/production-readiness-recovery.md`; that recovery script is not part of the normal Hugo gate.
- [ ] The current-head public production-readiness workflow passed.
- [ ] The required manual Hugo gate passed for both active people and the unauthorized test identity.
- [ ] No required checklist item is failing and no new spending is needed.
- [ ] The pilot owner approves granting access and opening the pilot.
