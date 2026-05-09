# Plan 07-1: Onboarding Summary Model

## Goal

Create a small tested model that turns learner program, course, lesson, and completion data into first-session onboarding facts.

## Scope

- Add a pure helper under `src/lib/learner-onboarding/`.
- Compute assigned program count, course count, required lesson totals, completion totals, first available course, next available lesson, and completion percent.
- Keep the helper independent of Supabase so it is easy to test.

## Tasks

1. Write failing unit tests for empty assignments, first-course selection, next-lesson selection, and completion percent.
2. Implement the model with typed inputs that match existing shaped program/course data.
3. Export only the model and types needed by learner pages.
4. Run the focused test and `npm run verify`.

## Acceptance

- The model returns a clear empty state when no programs are assigned.
- The model identifies a next available lesson when lesson data exists.
- The model handles zero required lessons without divide-by-zero behavior.
- Tests cover the first-action and progress calculations.
