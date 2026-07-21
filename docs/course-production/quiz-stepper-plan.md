# One-question-at-a-time quiz flow (Thinkific-style) — approved plan

Status: approved by Jarrad Henry, 2026-07-21. Execution surface: Codex convergence loop, Claude (this session) as reviewing checkpoint.

## Context

The rebuilt 920-question bank ships with exhaustive randomized delivery. A 40–80 question quiz on one long page with no feedback until the end is a poor learning experience. Replace it with the Thinkific pattern: one question at a time, progress bar, immediate right/wrong feedback with explanation after each answer — server-side reveal (client never holds the answer key for unanswered questions; client-side reveal was considered and explicitly rejected by the product owner). Immediate feedback doubles as teaching: wrong answers show the correct one.

Baseline: this worktree, branch `claude/quiz-one-by-one`, from `origin/main` @ `31aeb4b`. Deps installed.

## Locked decisions (do not relitigate)

1. Server-side per-question reveal; DB grant hardening (migrations 009/017, which revoke `answer_options.is_correct` and `questions.explanation` from client roles entirely) stays untouched.
2. First answer locks (anti-probe): same-selection resubmit = idempotent success; different-selection resubmit = rejected. Enforced in the database, not just the client.
3. Incremental persistence → mid-attempt resume across refresh (new capability, free consequence of the design).
4. Final score stays authoritative + server-computed; `src/lib/quizzes/score.ts`, `attempts.ts`, `attempt-selection.ts` completely untouched — `scoreQuizAttempt` is reused unmodified for both per-question correctness (single-question call, `earnedPoints > 0`) and the final grade.
5. `show_correct_answers_after` (`never|after_pass|always`) continues to govern only the end-of-attempt review payload; per-question feedback is unconditional in the new flow. Admin quiz editor (`quiz-editor.tsx`) untouched.
6. Eligibility (`authenticatedQuizContext`) re-checked at attempt start and finalize only — not per-question (matches today's trust boundary; the authoritative gate is finalize).
7. No changes to `src/components/content-blocks.tsx` or `page.tsx`'s `QuizLessonBody` — `QuizRunner`'s public prop contract is preserved exactly, so this is a swap-in-place.

## Server changes — `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts` + one migration

### New migration `supabase/migrations/0XX_atomic_quiz_answer_recording.sql` (next free sequence number after the current highest in `supabase/migrations/`)

One `SECURITY DEFINER` RPC:

```sql
fn_record_quiz_answer(p_attempt_id uuid, p_question_id uuid, p_selected text[])
  returns table (responses jsonb, completed_at timestamptz, already_answered boolean)
```

Model it directly on this repo's existing idiom — read `fn_record_video_playback` (migration `031_versioned_video_completion_and_submission_evidence.sql`) and `fn_complete_role_play_block` (migration `028_atomic_role_play_completion.sql`) before writing this; match their lock/validate/merge structure exactly.

Required behavior:
- `SELECT ... FOR UPDATE` row-locks the attempt for the transaction duration → serializes concurrent tabs on the same attempt.
- Merge exactly one key into the jsonb `responses` column via `responses || jsonb_build_object(p_question_id::text, to_jsonb(p_selected))`, inside the lock. **This is the entire reason a migration is needed**: supabase-js `.update()` can only replace the whole column; a client-side read-merge-write can silently lose a concurrent write to a *different* question's key. Do not attempt to solve this with `.eq()`/`.is()` preconditions from TypeScript — it doesn't compose against a concurrent write to an unrelated key.
- Inside the lock, in order: `auth.role() = 'service_role' OR auth.uid() = user_id` ownership check (else raise "Attempt not found." — no existence leak); `completed_at is not null` → raise "This attempt has already been submitted."; `question_order ? p_question_id::text` membership → raise "The response contains a question outside this attempt."; reject null/empty/duplicate `p_selected` (dedup count check); `answer_orders[p_question_id]` superset check on every id in `p_selected` → raise "The response contains an answer outside this attempt."
- First-answer-locks branch: if `responses ? p_question_id::text` already, compare the stored set to `p_selected` (order-independent). Same set → return the existing row with `already_answered: true` (no rewrite, no error — this is the idempotent-retry path). Different set → raise "This question has already been answered."
- Otherwise: perform the merge update, return the new row with `already_answered: false`.
- `revoke all ... from public; grant execute ... to authenticated, service_role;` — call via the **learner** client (not admin), matching the dual-check convention (`auth.uid()` check inside the function is defense-in-depth alongside app-level auth).
- After the migration lands: regenerate `src/lib/supabase/types.ts` (Supabase MCP `generate_typescript_types`, or `supabase gen types typescript`) so `.rpc("fn_record_quiz_answer", ...)` is typed. Existing generated entries for other RPCs are around lines 1462/1496 of that file for reference on shape.

### New server action `answerQuizQuestion`

```ts
export type QuestionReveal = {
  questionId: string;
  isCorrect: boolean;
  correctOptionIds: string[];
  explanation: string | null;
};

export type QuizAnswerResult =
  | { ok: true; reveal: QuestionReveal }
  | { ok: false; error: string };

export async function answerQuizQuestion(input: {
  attemptId: string;
  questionId: string;
  selected: string[];
}): Promise<QuizAnswerResult>
```

Flow: auth check → attempt ownership lookup via learner client (`.eq("id", attemptId).eq("user_id", user.id)`, else "Attempt not found.") → `completed_at` pre-check → `question_order` membership pre-check → fetch the single question + its options via the admin client (only place `is_correct`/`explanation` are readable) → `validateResponseCardinality` (existing helper, reused) against this one question's scoring shape → `answer_orders[qid]` superset pre-check → call `fn_record_quiz_answer` via the learner client → derive `isCorrect` by calling the **unmodified** `scoreQuizAttempt([scoringQuestion], {[qid]: persistedSelectedFromRpcResponse}, 0).earnedPoints > 0` (never write a parallel correctness rule) → return `{ok: true, reveal: {questionId, isCorrect, correctOptionIds: scoring.correctOptionIds, explanation}}`.

All the TS pre-checks are fast-fail conveniences; the RPC is the authoritative enforcement (defense-in-depth — TS checks must produce the exact same rejection messages as the RPC would, so a bypass attempt gets an identical error either way).

### `startQuizAttempt` — additive resume payload (no breaking changes to existing fields)

```ts
export type QuizStartResult =
  | {
      ok: true;
      attemptId: string;
      questions: AttemptQuestion[];
      resumed: boolean;
      responses: Record<string, string[]>;   // NEW — persisted answers so far, {} if fresh
      reveals: QuestionReveal[];              // NEW — correctness/explanation for already-answered questions only
    }
  | { ok: false; error: string };
```

On the resume branch, fetch the answer-key data for the subset of `questionOrder` already present as keys in the existing attempt's `responses`, and build `reveals` with the same derivation `answerQuizQuestion` uses (factor a small shared private helper, e.g. `buildReveal(scoringQuestion, explanation, persistedSelected)`, so the `scoreQuizAttempt(...).earnedPoints > 0` line isn't duplicated). `restoreAttemptQuestions` (`src/lib/quizzes/attempt-selection.ts`) stays untouched — `reveals` is additive data alongside its existing answer-key-free `AttemptQuestion[]` output, not a replacement.

### `submitQuizAttempt` → renamed `finalizeQuizAttempt({attemptId})` — no `responses` argument

```ts
export async function finalizeQuizAttempt(input: { attemptId: string }): Promise<QuizSubmitResult>
```

This is a deliberate breaking rename (not a compat wrapper) — the old `{attemptId, responses}` shape is incompatible with "answers are already locked server-side per question." The only caller is `quiz-runner.tsx`, rewritten in lockstep, so the rename surfaces the break at compile time rather than hiding a silent signature change.

Behavior, in order: auth check → load attempt via learner client (id, user_id, quiz_id, lesson_id, question_order, answer_orders, **responses**, completed_at) → `authenticatedQuizContext(...)` unchanged eligibility re-check → **read `responses` from the persisted row, not from any client input** → `validateResponses` (existing helper) for completeness against the persisted map, same message "Answer every question before submitting." → admin-client fetch of the full question/option set over `questionOrder` (unchanged) → `validateResponseCardinality` (unchanged, now a defensive re-check since `answerQuizQuestion` already enforced it per-question) → `scoreQuizAttempt` (unchanged) → guarded update `.update({score, passed, completed_at}).eq("id", attempt.id).eq("user_id", user.id).is("completed_at", null)` — **note `responses` is no longer written here, it's already persisted incrementally** → revalidatePath + `emitSandraCourseCompletedForLesson` (unchanged) → `review` payload gated by the unchanged `shouldRevealAnswers(show_correct_answers_after, passed)`.

**Idempotency requirement (do not skip this — it's required for the client's retry-safety design):** if the guarded update matches 0 rows because `completed_at` was already set (e.g. a retried finalize call after a network blip on a call that actually landed), do **not** hard-error. Re-read the attempt's stored `score`/`passed`, rebuild the `review` payload under the same policy gate, and return it as a normal success result. Only genuinely new failures (auth, eligibility, incomplete responses) should still error.

### Rejection matrix (both TS pre-check and RPC layers listed where both apply)

| Case | Rejected where | Result |
|---|---|---|
| Unauthenticated | TS, top of action | "You must be signed in." |
| Attempt belongs to another user | TS lookup | "Attempt not found." (no existence leak) |
| Answer after `completed_at` set | TS pre-check + RPC | "This attempt has already been submitted." |
| Question not in `question_order` | TS pre-check + RPC | "The response contains a question outside this attempt." |
| Option not in `answer_orders[qid]` | TS pre-check + RPC | "The response contains an answer outside this attempt." |
| Cardinality violation / duplicate ids | TS (`validateResponseCardinality`) + RPC (dedup check) | existing cardinality message / RPC's message |
| Same question, same selection resubmitted | RPC | idempotent success, `already_answered: true`, no rewrite |
| Same question, different selection resubmitted | RPC | "This question has already been answered." |
| Two tabs answer the same question concurrently | RPC `FOR UPDATE` serializes | one writer wins; loser hits the idempotent-or-reject rule above — never data loss |
| Two tabs answer different questions concurrently | RPC row lock + jsonb merge | both land, no lost update |
| Finalize with an unanswered question | TS `validateResponses` against persisted `responses` | "Answer every question before submitting." |
| Finalize retried after a landed completion | TS idempotency amendment | returns the stored result, no error |
| Eligibility changes mid-attempt | Only re-checked at finalize (unchanged from today) | same behavior as current `submitQuizAttempt` |

## Client changes — 4 flat files in `src/app/(dashboard)/lessons/[lessonId]/` (matches the existing `quiz-gate-card.tsx` split-out idiom — do not nest a new subfolder)

- **`quiz-runner.tsx`** (rewrite) — orchestrator. `useReducer` state machine:
  ```ts
  type Answer = { correct: boolean; correctOptionIds: string[]; explanation: string | null };
  type RunnerState =
    | { status: "idle" }
    | { status: "starting" }
    | {
        status: "run";
        attemptId: string;
        questions: QuizQuestion[];
        viewIndex: number;
        maxReachedIndex: number;
        selected: Record<string, string[]>;
        answers: Record<string, Answer>;
        phase: "answering" | "checking" | "revealed" | "check_error" | "finalizing" | "finalize_error";
      }
    | { status: "done"; result: /* existing QuizSubmitResult ok-branch shape */ };
  ```
  Public props **unchanged**: `{quizId, lessonId, passingScore, backHref, attemptsUsed, attemptsLeft, retakeCooldownHours}`. `QuizResultCard` (existing, lines ~251-341 today) is reused as-is for the `done` state — do not rewrite it (Coach pass/fail emotions, policy-gated review list, retake button all stay).

  Transitions: `idle` →(Start click, `startQuizAttempt`)→ `starting` →(ok)→ `run` at `viewIndex = firstUnanswered(questions, responses)`; if resumed and every question already has a `responses` entry, land on the last index with `phase: "revealed"` and "Finish" ready. `answering` → toggle just mutates `selected[qid]` (radio replace for single_choice/true_false, checkbox toggle for multi_select) → "Check answer" enabled once `selected[qid].length >= 1` (same button/flow for all three question types — no auto-check-on-select) → click → `checking` (inputs + button disabled from here on, so a retry resends the identical payload) → success: `answers[qid]` set, `phase: "revealed"`, `maxReachedIndex = max(maxReachedIndex, viewIndex)` → failure: `phase: "check_error"`, inline "Couldn't check that answer" + "Try again" that re-issues the identical call (server idempotency makes this safe even if the original write actually landed). From `revealed`: "Next" (not last) → `viewIndex + 1`, and if that index already has an `answers` entry (back-then-forward through history) skip straight to `revealed` with **no server call**; "Finish" (last question) → `phase: "finalizing"` → `finalizeQuizAttempt` → success → `status: "done"` (triggers the existing `router.refresh()` on pass) → failure → `phase: "finalize_error"` with retry.

  **Back navigation is in scope**, bounded to `[0, maxReachedIndex]` — pure client-side index change to `phase: "revealed"` for the target question, replaying its stored `answers[qid]`, never a server call, and never able to skip ahead past `maxReachedIndex` (no way to jump to an unanswered question out of order).

- **`quiz-question-card.tsx`** — question text, option list (native radio/checkbox — same tokens/markup as today), "Check answer" button, renders `QuizFeedback` inline once `phase` is `revealed`/`check_error`. Props: `{question, index, total, selected, phase, feedback, onToggle, onCheck, onRetryCheck}`. Inputs get `disabled`/`aria-disabled="true"` once `phase !== "answering"`.

- **`quiz-feedback.tsx`** — Correct/Incorrect `Badge` (`tone="green"`/`tone="red"` — both already exist), small `Coach` reaction (`emotion="smile"` correct / `emotion="worried"` incorrect — `"laugh"` stays reserved for the final pass card), correct-option callout, explanation text, wrapper `aria-live="polite"` (matches the existing pattern in `flashcard-block.tsx` / `role-play-block.tsx`).

- **`quiz-progress.tsx`** — "Question N of M" text (`aria-live="polite"`, matching `flashcard-block.tsx` line ~40) + existing `src/components/bmh-ds/progress-bar.tsx` (`tone="blue"`, `value={viewIndex+1}`, `max={total}`, `showLabel` optional). No new design-system components or CSS tokens anywhere in this feature — option post-reveal styling reuses existing tokens: correct+selected → `border-color: var(--success)` / `background: var(--success-soft)`; correct, not selected → `border-color: var(--success)` only; selected, not correct → `border-color: var(--danger)` / `background: var(--danger-soft)`; everything else dims to `border-color: var(--ink-200)`. Question-swap transition reuses `var(--dur-slow)` / `var(--bmh-ease-out)` (the same pair `ProgressBar` itself already uses for its width transition).

- Focus management: the question heading gets `tabIndex={-1}` + a ref; a `useEffect` keyed on `[viewIndex]` calls `.focus()` on it on every index change (Start→Q1, Next, Prev, resume-landing). No custom keyboard handling needed beyond native radio/checkbox semantics — deliberately do **not** add arrow-key advance (unlike `FlashcardBlock`'s hand-rolled arrows), since that would let a learner skip past unrevealed feedback.

## Tests

New `answerQuizQuestion` functional tests (mock style of the existing suite; add an `rpc` spy to the mocked learner client, following the exact pattern already in `video-actions.test.ts`):
1. First answer persists via the RPC, returns the correct reveal for only that question.
2. Same-selection resubmit is idempotent (`ok: true`, same reveal, mock RPC returns `already_answered: true`).
3. Different-selection resubmit surfaces the RPC's rejection message.
4. Question outside `question_order` rejected before the RPC call (assert the rpc spy was never called).
5. Cardinality violation rejected before the RPC call.
6. Option outside `answer_orders[qid]` rejected before the RPC call.
7. Answering after `completed_at` is set is rejected by the TS pre-check.
8. Unauthenticated call rejected.

`quiz-actions.functional.test.ts` updates: every `submitQuizAttempt` test becomes a `finalizeQuizAttempt` test — drop the `responses` argument from calls, give fixtures a persisted `responses` field instead (e.g. "scores only the persisted subset" now asserts against the fixture's stored `responses`, not the call's input); add a finalize-retry-after-landed-completion test asserting the idempotent success path; the resume test asserts the new `responses`/`reveals` fields on `startQuizAttempt`'s result. All existing pass/fail/review-policy/cooldown assertions must keep passing (rewritten to the new call shape, not weakened).

`quiz-actions.test.ts` (the brittle source-text grep test): preserve every literal substring it currently asserts (`23505`, the three `.eq`/`.is` guard clauses, `validateResponseCardinality`, `show_correct_answers_after`, `shouldRevealAnswers`) inside the rewritten `finalizeQuizAttempt` so this file doesn't need touching beyond adding new greps for `fn_record_quiz_answer` and the idempotency branch.

`quiz-runner.test.tsx` — full rewrite (RTL + vitest, same mocking conventions: `vi.mock("./quiz-actions")`, `vi.mock("sonner")`, `vi.mock("next/navigation")`). Cases: happy path × each question type (single_choice, true_false, multi_select); wrong-answer feedback (badge, Coach, explanation, correct option shown); full run to finish → existing `QuizResultCard` (reuse all current pass/fail/cooldown/exhausted assertions verbatim); resume fast-forward to first unanswered question with prior answers pre-loaded; back-navigation replay of a prior answer with **zero** additional server calls; check-answer failure + retry (assert identical call args both times); retry-after-landed-write shows feedback instead of erroring; finalize failure + retry; back-nav cannot exceed `maxReachedIndex`; retake reset (existing behavior); attempts-exhausted/cooldown states (existing, unchanged — only touch `QuizResultCard`/`QuizGateCard`, not rewritten here); start-quiz server error toast (existing).

New `quiz-question-card.test.tsx` (unit-level): Check-button enable/disable thresholds per question type; option toggle semantics (radio vs checkbox); inputs disabled once `phase !== "answering"`; correct/incorrect visual state renders the right `Badge` tone.

## Execution order

1. Migration (`0XX_atomic_quiz_answer_recording.sql`) + regenerate `src/lib/supabase/types.ts` + `answerQuizQuestion` + `startQuizAttempt` resume additions + `finalizeQuizAttempt` rename/rewrite + all server-side tests. Apply the migration to the **test** Supabase project (`jvaabkchkihkjllehmft`) only — never production — and run the full functional suite against it. Do not touch `score.ts`/`attempts.ts`/`attempt-selection.ts`.
2. Client rewrite: the 4 files above + their tests. Run `npm run verify` (typecheck + vitest + RTL) — this is the same command the repo's pre-commit hook runs, so it must be green before any commit attempt.
3. Manual browser walkthrough against the test-project-backed dev server: start a quiz, answer correctly, answer incorrectly (see explanation), refresh mid-attempt (confirm resume lands correctly with prior answers replayable via Back), finish, confirm the existing result card/retake still works. Capture screenshots as evidence.
4. Confirm via the browser network tab that `startQuizAttempt`'s response never contains `is_correct` or `explanation` for any question without a `responses` entry — this is the core security property of the whole feature and must be checked directly, not assumed from the code.
5. Commit on `claude/quiz-one-by-one`. Do not push, do not open a PR, do not merge, do not touch the production Supabase project or apply any migration there — all of that is gated on Jarrad's explicit review and go-ahead in a later step, outside this loop's scope.

## Acceptance gates (all must be independently verified, not self-reported)

- [ ] Migration applies cleanly to the test project; `fn_record_quiz_answer` exists with the exact signature above.
- [ ] `src/lib/quizzes/score.ts`, `attempts.ts`, `attempt-selection.ts` have zero diff against `origin/main`.
- [ ] `npm run verify` (typecheck + vitest + RTL) passes with zero failures, zero new skips.
- [ ] Every new/updated test in the Tests section above exists and passes.
- [ ] Browser walkthrough screenshots exist showing: one-by-one flow, wrong-answer explanation, progress bar, refresh-mid-attempt resume, finish → existing result card.
- [ ] Network-tab evidence that no unanswered question's answer key ever reaches the client.
- [ ] `git status` shows only the intended new/changed files; nothing pushed, no PR opened, no production database touched.
