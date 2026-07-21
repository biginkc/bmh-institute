---
quick_task: 260721-hvh
title: Keep focus on the completed quiz result
type: execute
autonomous: false
branch: codex/quiz-result-focus
files_modified:
  - src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx
  - src/app/(dashboard)/lessons/[lessonId]/quiz-runner.test.tsx
  - src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts
  - src/app/(dashboard)/lessons/[lessonId]/quiz-actions.functional.test.ts
  - src/app/(dashboard)/lessons/[lessonId]/page.tsx
  - src/app/(dashboard)/lessons/[lessonId]/learner-state-scope.test.ts
  - e2e/write-paths.spec.ts
must_haves:
  truths:
    - A learner who passes a quiz remains on the client-rendered QuizResultCard and its Passed heading receives keyboard focus after finalization.
    - Finalizing a quiz triggers neither client router.refresh nor Server Action revalidatePath, so the action response cannot immediately replace the focused QuizResultCard with the parent server-rendered QuizGateCard.
    - Standalone and composite quiz results both receive `/courses/${courseId}` as their Back to course destination rather than a standalone or composite lesson URL.
    - A real Next runtime E2E waits for the finalization Server Action response to settle, proves the client Passed result remains mounted and focused, clicks the actual QuizResultCard Back to course Link and the course-page Back to dashboard Link, and proves both linked client-navigation destinations show the newly unlocked assignment through fresh dynamic reads.
    - The deployed production learner flow has the Passed heading focused at both desktop and mobile viewport sizes.
  artifacts:
    - path: src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx
      provides: Finalization flow that transitions directly to QuizResultCard without a client router refresh.
    - path: src/app/(dashboard)/lessons/[lessonId]/quiz-runner.test.tsx
      provides: RTL regression proof of Passed-heading focus and no router refresh after a successful finalization.
    - path: src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts
      provides: Quiz finalization persistence and result payload without action-time path revalidation or replacement Flight data.
    - path: src/app/(dashboard)/lessons/[lessonId]/quiz-actions.functional.test.ts
      provides: Functional regression proof that a successful finalization writes the result and calls no revalidatePath boundary.
    - path: src/app/(dashboard)/lessons/[lessonId]/page.tsx
      provides: Course-aware backHref wiring for standalone and composite QuizLessonBody callers.
    - path: src/app/(dashboard)/lessons/[lessonId]/learner-state-scope.test.ts
      provides: Focused source invariant that both QuizLessonBody call sites use the owning course URL and no result backHref points to a lesson URL.
    - path: e2e/write-paths.spec.ts
      provides: Real Next Server Action proof that the focused QuizResultCard survives the settled response and later dynamic navigation reads fresh state.
  key_links:
    - from: src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx
      to: QuizResultCard
      via: done reducer transition followed by QuizResultCard useEffect focus
      pattern: 'dispatch\\(\\{ type: "done".*QuizResultCard.*headingRef.*focus'
    - from: src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts
      to: src/app/(dashboard)/lessons/[lessonId]/page.tsx
      via: returns the finalization result without revalidatePath so the current parent tree is not included as replacement Flight data
      pattern: 'return buildSubmitResult'
    - from: src/app/(dashboard)/lessons/[lessonId]/page.tsx
      to: src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx
      via: standalone and composite QuizLessonBody calls pass the owning course URL through backHref
      pattern: 'backHref=\\{`/courses/\\$\\{courseId\\}`\\}'
    - from: e2e/write-paths.spec.ts
      to: src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx
      via: waits for the real Next Action response to finish, then asserts result-specific copy and Passed-heading focus
      pattern: 'next-action.*finished.*Passed.*toBeFocused'
    - from: e2e/write-paths.spec.ts
      to: src/app/(dashboard)/courses/[courseId]/page.tsx
      via: clicks QuizResultCard Back to course Next Link and observes the prerequisite-gated assignment link unlocked
      pattern: 'Back to course.*Text Assignment Lesson'
    - from: e2e/write-paths.spec.ts
      to: src/app/(dashboard)/dashboard/page.tsx
      via: clicks the course-page Back to dashboard Next Link and observes the same current unlocked assignment surface
      pattern: 'Back to dashboard.*Text Assignment Lesson'
---

# Keep focus on the completed quiz result

## Goal

Prevent successful quiz completion from replacing the focused client result card with the unfocused server quiz gate. Suppress both client refresh and Server Action revalidation during finalization, route every quiz result back to its actual course, then prove linked dynamic navigation reads the persisted completion state.

## Scope and constraints

- Change only the quiz runner and RTL test, the quiz Server Action and functional test, the lesson page and its existing source-invariant test, and the seeded write-path E2E.
- Remove `revalidatePath` from `finalizeQuizAttempt`. In a Server Action this invalidation marks the current work store as revalidated and can make the action handler return parent Flight data immediately, replacing the just-mounted client result card.
- Preserve quiz eligibility, persistence, scoring, completion integration emission, retry behavior, and server gate behavior.
- Remove the premature client refresh after a successful finalization. Do not replace either refresh boundary with another client navigation or focus workaround.
- Rely on the existing dynamic route contract for later freshness: lesson and dashboard server reads create the Supabase client through `cookies()`, so a subsequent navigation executes fresh server data reads without action-time invalidation.
- Use TDD: make the regression assertion fail before changing the runner.

## Tasks

<task type="auto" tdd="true">
  <name>Task 1: Remove both immediate parent-rerender triggers</name>
  <files>src/app/(dashboard)/lessons/[lessonId]/quiz-runner.tsx, src/app/(dashboard)/lessons/[lessonId]/quiz-runner.test.tsx, src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts, src/app/(dashboard)/lessons/[lessonId]/quiz-actions.functional.test.ts</files>
  <behavior>
    - The existing successful multi-question completion flow renders the Passed result heading and that heading owns focus after the result card effect runs.
    - The same successful finalization invokes neither the mocked client router refresh nor mocked server revalidatePath function.
    - Finalization still persists score, pass state, and completion time and returns the same QuizSubmitResult payload.
    - Failed, retried, and concurrent-landed finalization behaviors remain unchanged.
  </behavior>
  <action>First update the successful runner test to keep its Passed-heading focus assertion and require `refresh` to have zero calls. In the functional successful-finalize case replace the positive lesson-path revalidation expectations with `expect(revalidatePath).not.toHaveBeenCalled()` while retaining the persisted score and review assertions. Run both focused tests red against the original behavior. Then remove the `useRouter` dependency and passed-result `router.refresh()` branch from the runner. In `quiz-actions.ts` remove the `next/cache` import and all lesson, prerequisite-lesson, and dashboard `revalidatePath` calls from the successful write path. Leave the database update, race recovery, Sandra completion emission, and returned result unchanged. Do not add `refresh`, `redirect`, `revalidateTag`, or another invalidation call: later cookie-dependent route navigation is the freshness boundary.</action>
  <verify><automated>npm run test:rtl -- 'src/app/(dashboard)/lessons/[lessonId]/quiz-runner.test.tsx' && npm run test -- 'src/app/(dashboard)/lessons/[lessonId]/quiz-actions.functional.test.ts' && npm run verify</automated></verify>
  <done>The runner directly mounts and focuses QuizResultCard, successful finalization calls neither client refresh nor server revalidation, persistence and recovery tests pass, and the full repository verification gate passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Route both quiz result variants to the course and prove real linked navigation</name>
  <files>src/app/(dashboard)/lessons/[lessonId]/page.tsx, src/app/(dashboard)/lessons/[lessonId]/learner-state-scope.test.ts, e2e/write-paths.spec.ts</files>
  <behavior>
    - StandaloneQuizLesson passes `/courses/${courseId}` to QuizLessonBody for both QuizRunner and QuizGateCard result links.
    - ContentCompositeLesson passes courseId into PartBody, whose quiz branch passes `/courses/${courseId}` to QuizLessonBody instead of the current composite lesson URL.
    - The seeded browser sends the real finalization Server Action request through the running Next application.
    - After the Next Action response is fully settled, result-specific client copy remains mounted and the Passed heading owns focus.
    - The E2E scopes the duplicate Back to course label to QuizResultCard and clicks that result-card link, not the page-header link.
    - Clicking the result card's Back to course Next Link performs a real client navigation whose fresh dynamic server read shows the next prerequisite-gated assignment lesson unlocked.
    - Clicking the course page's Back to dashboard Next Link performs a second client navigation whose dashboard course surface also shows that assignment unlocked and current.
  </behavior>
  <action>First extend `learner-state-scope.test.ts`, the existing page-source invariant suite, with a focused routing contract. Slice the StandaloneQuizLesson and PartBody sections independently; require each QuizLessonBody call to pass the exact owning-course template literal `/courses/${courseId}`, require ContentCompositeLesson to pass `courseId={courseId}` into PartBody, and reject either former lesson-based backHref. This is appropriate focused coverage because the page module's async Supabase loading prevents a small isolated render test and the repository already tests this page's server wiring through source invariants. Then change StandaloneQuizLesson to pass the owning course URL. Add `courseId` to PartBody's props, pass it from ContentCompositeLesson, and use the same owning course URL in the composite quiz branch. The shared QuizLessonBody will continue passing that href to either QuizGateCard or QuizRunner.

Extend the successful quiz section of the existing disposable `drives learner/admin LMS write paths against non-production data` test. Immediately before clicking Finish, register a `page.waitForResponse` predicate for the POST carrying the `next-action` request header. Await the Finish click and that response, assert it is successful, then await `response.finished()` before inspecting the DOM. Assert the client-result-only coaching copy (`On to the next lesson`) remains visible and the Passed heading is focused; the copy distinguishes QuizResultCard from the server QuizGateCard, which says the learner already passed. After those assertions, do not navigate by URL. Assert there are two visible Back to course links, scope a result-card container from the client-only result copy or Passed heading to its nearest ancestor containing a Back to course link, and click only that container's link. Assert the URL is `/courses/${fixture.courseId}` and the prerequisite-gated `${fixture.prefix} Text Assignment Lesson` has a reachable link on the course tile grid. Then click the real course-page `Back to dashboard` link, assert the URL is `/dashboard`, assert the fixture course heading is visible, and assert the dashboard's learner tile grid also exposes a reachable `${fixture.prefix} Text Assignment Lesson` link. These two Next Link transitions prove both correct result-card routing and fresh dynamic reads. Do not select the header link by index, mock the action, call the action directly, or replace the running Next server with a component harness.</action>
  <verify><automated>npm run test -- 'src/app/(dashboard)/lessons/[lessonId]/learner-state-scope.test.ts' && npm run test:e2e -- e2e/write-paths.spec.ts --project=chromium --grep 'drives learner/admin LMS write paths against non-production data'</automated></verify>
  <done>Both standalone and composite QuizLessonBody paths wire their result and gate links to the owning course, the source invariant passes, and the real Next E2E clicks the result-card link specifically before proving fresh course and dashboard state through real Next Links.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Prove completed-result focus on production desktop and mobile</name>
  <what-built>The finalized quiz flow keeps the focused client QuizResultCard in place without either a client refresh or action-time server revalidation.</what-built>
  <how-to-verify>
    1. After the merged change reaches `https://institute.bmhgroupkc.com`, sign in using the existing real Hugo learner identity and complete one exact-ID passing-quiz canary at a desktop viewport (1280 by 800).
    2. Immediately after Finish, confirm the Passed result card remains visible and DevTools shows `document.activeElement` is the Passed heading, not the page body or a server-rendered quiz gate.
    3. Without navigating, refreshing, or completing another quiz, resize the same already-rendered result card to the mobile viewport (390 by 844) and confirm the Passed heading still owns focus.
    4. Reset the viewport to desktop (1280 by 800). Locate the `Back to course` link inside the result card containing the Passed heading and client result copy, not the identical page-header link, then click it and confirm the prerequisite-gated next assignment is unlocked on the course page. Click the course page's `Back to dashboard` link and confirm the dashboard course surface also shows that assignment unlocked and current. Do not refresh or type either destination URL.
  </how-to-verify>
  <resume-signal>Type "approved" with the two viewport results, or describe the observed focus or freshness failure.</resume-signal>
</task>

## Overall verification

Run the co-located RTL, functional Server Action, and lesson-page source-invariant suites, `npm run verify`, and the focused seeded Playwright write-path test against a real Next server. Review the diff to ensure only the seven scoped files changed, then use the real production browser at desktop and mobile sizes after deployment. Treat mocked RTL, functional, and source-invariant checks as boundary evidence; the real Next E2E proves the Flight-response, result-link routing, and later client-navigation behavior while the production DOM focus checks remain the final acceptance proof.

## Final gate

The change is ready for review only when the targeted RTL, functional, and page-source tests, `npm run verify`, and focused real-Next E2E pass; neither `router.refresh` nor `revalidatePath` can run during successful finalization; standalone and composite result links point to the owning course; the client result survives the settled action response with its Passed heading focused; the result-card Back to course and course-page Back to dashboard links both show fresh unlocked state; and production desktop and mobile both retain focus on the Passed heading.
