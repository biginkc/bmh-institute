---
quick_task: 260721-hvh
title: Keep focus on the completed quiz result
type: execute
autonomous: false
branch: codex/quiz-result-focus
files_modified:
  - src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx
  - src/app/(dashboard)/lessons/[lessonId]/quiz-runner.test.tsx
must_haves:
  truths:
    - A learner who passes a quiz remains on the client-rendered QuizResultCard and its Passed heading receives keyboard focus after finalization.
    - Finalizing a passed quiz does not call client router.refresh, so the just-rendered focused result is not replaced by the server-rendered QuizGateCard.
    - Lesson and dashboard data remain fresh on subsequent navigation through the existing server finalizeQuizAttempt revalidatePath calls.
    - The deployed production learner flow has the Passed heading focused at both desktop and mobile viewport sizes.
  artifacts:
    - path: src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx
      provides: Finalization flow that transitions directly to QuizResultCard without a client router refresh.
    - path: src/app/(dashboard)/lessons/[lessonId]/quiz-runner.test.tsx
      provides: RTL regression proof of Passed-heading focus and no router refresh after a successful finalization.
  key_links:
    - from: src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx
      to: QuizResultCard
      via: done reducer transition followed by QuizResultCard useEffect focus
      pattern: 'dispatch\\(\\{ type: "done".*QuizResultCard.*headingRef.*focus'
    - from: src/app/(dashboard)/lessons/[lessonId]/quiz-runner.test.tsx
      to: src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx
      via: mocked successful finalize action and router spy
      pattern: 'Passed.*toHaveFocus|refresh.*not\\.toHaveBeenCalled'
---

# Keep focus on the completed quiz result

## Goal

Prevent successful quiz completion from replacing the focused client result card with the unfocused server quiz gate, while retaining server-side cache invalidation for later navigation.

## Scope and constraints

- Change only the quiz runner and its co-located RTL test.
- Do not change `finalizeQuizAttempt`, its existing `revalidatePath` calls, quiz eligibility, scoring, retry behavior, or server gate behavior.
- Remove the premature client refresh after a successful finalization. Do not replace it with another client navigation or focus workaround.
- Use TDD: make the regression assertion fail before changing the runner.

## Tasks

<task type="auto" tdd="true">
  <name>Task 1: Lock the completed-result focus contract with RTL</name>
  <files>src/app/(dashboard)/lessons/[lessonId]/quiz-runner.test.tsx</files>
  <behavior>
    - The existing successful multi-question completion flow renders the Passed result heading and that heading owns focus after the result card effect runs.
    - The same successful finalization never invokes the mocked router refresh function.
  </behavior>
  <action>Update the existing end-to-end-in-component successful completion test, which already drives Finish and asserts the Passed heading. Keep the focus assertion and change the stale refresh expectation to `expect(refresh).not.toHaveBeenCalled()`. Run this targeted test before the runner change so its expected failure proves the regression is captured. Keep the current `next/navigation` mock only as the observable router-refresh spy; do not broaden mocks or add a synthetic server gate assertion.</action>
  <verify><automated>npm run test -- 'src/app/(dashboard)/lessons/[lessonId]/quiz-runner.test.tsx'</automated></verify>
  <done>The passing-result test explicitly proves the Passed heading is focused and router.refresh has zero calls after a successful finalization.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Preserve the client result card after successful finalization</name>
  <files>src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx, src/app/(dashboard)/lessons/[lessonId]/quiz-runner.test.tsx</files>
  <behavior>
    - A successful `finalizeQuizAttempt` dispatches the done state and renders QuizResultCard for both passed and failed outcomes.
    - A passed result focuses its Passed heading without calling router.refresh.
    - Existing finalize error and retry paths remain unchanged.
  </behavior>
  <action>After Task 1 is red, remove the `useRouter` dependency and the passed-result `router.refresh()` branch from `finishAttempt`. Leave the successful `done` dispatch immediately after the server action response so QuizResultCard mounts and its existing `useEffect` focuses `headingRef`. Do not modify the server action because its existing lesson and dashboard `revalidatePath` invalidation is the freshness mechanism for later navigation. Run the targeted RTL test green, then run the repository verification gate.</action>
  <verify><automated>npm run test -- 'src/app/(dashboard)/lessons/[lessonId]/quiz-runner.test.tsx' && npm run verify</automated></verify>
  <done>The runner contains no client router refresh on finalization, all focused RTL coverage passes, and npm run verify passes.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Prove completed-result focus on production desktop and mobile</name>
  <what-built>The finalized quiz flow keeps the focused client QuizResultCard in place instead of forcing a router refresh.</what-built>
  <how-to-verify>
    1. After the merged change reaches `https://institute.bmhgroupkc.com`, sign in using the existing real Hugo learner identity and complete one exact-ID passing-quiz canary at a desktop viewport (1280 by 800).
    2. Immediately after Finish, confirm the Passed result card remains visible and DevTools shows `document.activeElement` is the Passed heading, not the page body or a server-rendered quiz gate.
    3. Without navigating, refreshing, or completing another quiz, resize the same already-rendered result card to the mobile viewport (390 by 844) and confirm the Passed heading still owns focus.
    4. Reset the viewport to desktop (1280 by 800), then navigate back to the course and dashboard to confirm the normal server-invalidated completion state is current on later navigation.
  </how-to-verify>
  <resume-signal>Type "approved" with the two viewport results, or describe the observed focus or freshness failure.</resume-signal>
</task>

## Overall verification

Run the co-located RTL suite, `npm run verify`, review the diff to ensure only the two scoped files changed, then use the real production browser at desktop and mobile sizes after deployment. Treat mocked RTL focus proof as support evidence; the production DOM focus checks are the acceptance proof.

## Final gate

The change is ready for review only when the targeted RTL test and `npm run verify` pass, `router.refresh` is absent from the successful finalization path, and production desktop and mobile both retain focus on the Passed heading while later course and dashboard navigation shows fresh completion state.
