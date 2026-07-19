# Internal pilot runbook

Use this runbook for the first BMH Group internal learner pilot.

## Owners

- Pilot owner: BMH Group operations lead.
- Platform owner: BMH Institute admin.
- Support owner: person watching learner replies during the pilot window.

## Launch sequence

1. Confirm production is reachable at `https://institute.bmhgroupkc.com`.
2. Run the pre-pilot checklist in `docs/pre-pilot-checklist.md`.
3. Open `/admin/users`.
4. Confirm the Pilot setup table shows each pilot learner as Ready.
5. For any Needs access learner, open Review access and assign the correct role group.
6. Send invites only after the learner has the correct role group.
7. Tell learners to use the email address that received the invite.
8. After invites are sent, keep `/admin/users` open until each pilot learner is accepted or clearly pending.
9. Save a pilot status export from `/admin/reports` after launch.

## First learner session checks

Ask the first learner to confirm:

1. They can sign in.
2. The dashboard shows First step.
3. The dashboard shows assigned programs, courses, and required lessons.
4. They can open the first lesson.
5. They know where Profile and Password help are.

If any of these fail, pause new invites until the issue is fixed or understood.

## Monitoring during the pilot

Use `/admin/reports` as the command center.

Check these areas:

- Learner monitoring: who needs access, review, revision, or follow-up.
- Learners table: lesson, quiz, submission, certificate, and last activity rollups.
- Courses table: active learners and certificates by course.
- Programs table: certificates by program.
- Recent activity: latest learner and system events.

Use the action links in Learner monitoring:

- Review access opens the learner access editor.
- Review submissions opens the pending submissions queue.
- Review revision opens the needs revision queue.
- View learner opens the learner report.

Export CSV at least once per pilot day from `/admin/reports`.

## Assignment review

Use `/admin/submissions`.

1. Start with Pending.
2. Approve submissions that meet the instructions.
3. Use Request revision when the learner needs to resubmit.
4. Check Needs revision daily until the pilot is complete.
5. After approval, confirm the learner report updates.

## Common support cases

Learner cannot sign in:

1. Confirm the learner is using the invite email.
2. Check `/admin/users` for invite status.
3. If accepted but password is forgotten, send them to `/forgot-password`.
4. If invite expired, revoke and resend the invite.

Learner sees no training:

1. Open `/admin/users`.
2. Find the learner in Pilot setup.
3. If status is Needs access, assign the correct role group.
4. Ask the learner to refresh `/dashboard`.

Learner is stuck on an assignment:

1. Open `/admin/submissions`.
2. Check Pending and Needs revision filters.
3. Add a clear reviewer note if revision is needed.
4. Ask the learner to resubmit from the same lesson.

Certificate is missing:

1. Open the learner report from `/admin/reports`.
2. Confirm all required lessons show complete.
3. Confirm quiz and assignment lessons passed or approved.
4. Re-run production readiness only if this looks systemic.

## Cleanup and rollback

For normal pilot data, do not delete real learner records.

For disposable production readiness data, use `docs/production-readiness-recovery.md`.

If production readiness leaves test records behind:

1. Run `npm run cleanup:prod-readiness` in dry-run mode.
2. Save the JSON output.
3. Run execute mode only for `PRD-READY-` prefixed records.
4. Confirm dry-run returns zero remaining records.

If a deployed change breaks pilot launch:

1. Stop sending new invites.
2. Save the failing URL, user email, and screenshot.
3. Check GitHub Actions for the latest deployment and readiness run.
4. Revert or redeploy the last known good `main` commit.
5. Run production readiness again before resuming invites.

## No-spend boundary

This pilot must stay on the existing Google Workspace, Supabase, and Vercel setup.

Do not add paid providers, paid Vercel features, new email platforms, or new infrastructure unless Jarrad explicitly approves the spend.

