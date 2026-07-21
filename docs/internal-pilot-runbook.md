# Internal pilot runbook

Use this runbook for the first BMH Group internal learner pilot. Hugo proves
identity. Institute continues to own each user's authorization, role groups,
profile, and learning records.

## Owners

- Pilot owner: BMH Group operations lead.
- Platform owner: BMH Institute admin.
- Support owner: person watching learner replies during the pilot window.

## Launch sequence

1. Confirm production is reachable at `https://institute.bmhgroupkc.com`.
2. Complete `docs/pre-pilot-checklist.md`, including both active Hugo users and the unauthorized-user negative test.
3. Open `/admin/users` with a real Hugo-authenticated admin session.
4. Confirm each pilot email exactly matches that person's confirmed Hugo email.
5. For an existing user, preserve the current UID and update only the required role, status, or role groups.
6. For a missing authorized user, use **Grant Institute access**. This creates or locates the Institute account without a password and sends no Institute authentication email.
7. Confirm each learner is active and has the correct role groups before asking them to enter Institute.
8. Ask each learner to sign into Hugo, choose Institute, and confirm that Institute opens without another password prompt.
9. Save a pilot status export from `/admin/reports` after launch.

Do not send an Institute invite, create an Institute password, or use a recovery
link. If a person does not yet have Hugo, add them to Hugo first using the same
canonical email.

## First learner session checks

Ask the first learner to confirm:

1. Hugo opens Institute without asking for another credential.
2. The Institute session resolves to their existing profile and intended role.
3. The dashboard shows assigned programs, courses, and required lessons.
4. They can open the first lesson.
5. **Manage Hugo account** is available for centralized account management.
6. They cannot open an admin route unless their Institute role authorizes it.

If any check fails, pause additional access grants and diagnose the exact Hugo
email, Institute UID, status, and role-group assignment before continuing.

## Monitoring during the pilot

Use `/admin/reports` as the command center.

Check these areas:

- Learner monitoring: who needs access, review, revision, or follow-up.
- Learners table: lesson, quiz, submission, certificate, and last activity rollups.
- Courses table: active learners and certificates by course.
- Programs table: certificates by program.
- Recent activity: latest learner and system events.

Use the action links in Learner monitoring:

- **Review access** opens the learner access editor.
- **Review submissions** opens the pending submissions queue.
- **Review revision** opens the needs-revision queue.
- **View learner** opens the learner report.

Export CSV at least once per pilot day from `/admin/reports`.

## Assignment review

Use `/admin/submissions`.

1. Start with **Pending**.
2. Approve submissions that meet the instructions.
3. Use **Request revision** when the learner needs to resubmit.
4. Check **Needs revision** daily until the pilot is complete.
5. After approval, confirm the learner report updates.

## Common support cases

Learner cannot enter Institute:

1. Confirm they can sign into Hugo.
2. Confirm the Hugo email exactly matches the Institute profile email.
3. Check `/admin/users` for an active Institute account with the intended role and role groups.
4. Ask them to use **Continue with Hugo** from `/login` or open Institute from Hugo again.
5. If Hugo itself needs password recovery, complete it in Hugo. Institute recovery routes remain disabled.

Learner sees **Access not provisioned**:

1. Do not retry in a loop; an unprovisioned Hugo identity must remain denied.
2. Verify that the person is authorized for Institute.
3. If authorized, grant access to the exact Hugo email and then retry once.
4. Confirm no duplicate Institute user or profile was created.

Learner sees no training:

1. Open `/admin/users`.
2. Find the learner in Learner access.
3. If status is **Needs access**, assign the correct role group.
4. Ask the learner to refresh `/dashboard`.

Learner is stuck on an assignment:

1. Open `/admin/submissions`.
2. Check **Pending** and **Needs revision**.
3. Add a clear reviewer note if revision is needed.
4. Ask the learner to resubmit from the same lesson.

Certificate is missing:

1. Open the learner report from `/admin/reports`.
2. Confirm all required lessons show complete.
3. Confirm quiz and assignment lessons passed or were approved.
4. Escalate if the mismatch affects more than one learner.

## Recovery and rollback

Normal Hugo acceptance and read-only production smoke checks create no
disposable production data. `docs/production-readiness-recovery.md` is retained
only for historical `PRD-READY-` or `PILOT-DRYRUN-` leftovers from the retired
password-seeded harness.

If a deployed change breaks pilot entry:

1. Pause additional Institute access grants.
2. Save the failing URL, canonical email, UTC timestamp, and screenshot without recording credentials or cookies.
3. Check the current deployment and GitHub checks for the exact reviewed SHA.
4. Promote the recorded pre-Hugo deployment and re-enable the prior auth configuration only under the approved rollback plan.
5. Re-run the public Hugo boundary check, then repeat the manual two-user and unauthorized-user Chrome gate before resuming.

Never delete or replace canonical users, password hashes, profiles,
memberships, or learning records during rollback.

## No-spend boundary

This pilot must stay on the existing Google Workspace, Supabase, and Vercel
setup. Do not add paid providers, paid Vercel features, new email platforms, or
new infrastructure unless Jarrad explicitly approves the spend.
