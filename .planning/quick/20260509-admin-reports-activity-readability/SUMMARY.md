# Admin Reports Activity Readability Summary

## Result

The `/admin/reports` recent activity section now:

- Labels the card as learning activity.
- Explains that learner actions are shown first.
- Groups system-generated certificate, import, and maintenance rows under `System events`.
- Shows a clearer empty state when no learner activity exists yet.

The learner dashboard empty-state QA item was already resolved by Phase 7 and is marked that way in the QA tracker.

## Verification

- Red test first: `npm run test -- 'src/app/(dashboard)/admin/reports/activity-format.test.ts'` failed because `splitActivityRows` did not exist.
- Focused test passed after implementation.
