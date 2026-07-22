---
status: in_progress
created: 2026-07-21
goal_id: quiz-feedback-privacy
baseline_ref: 59d6dc93d82e69e93f21084cdbc4769a78502a1b
---

# Quiz feedback privacy and visual corrections

## Goal

Make quiz feedback useful without disclosing missed-question answers. Repair the
duplicated correct feedback, incorrect coach copy, speech-bubble tail, and the
clipped worried Andrea sprite. Preserve scoring, first-answer locking, resume,
navigation, attempt policy, and completed-quiz hard navigation.

## Required behavior

- Correct responses highlight only the learner's selected answer and show a
  useful explanation once. An explanation identical to the selected answer is
  suppressed.
- Incorrect responses highlight only the selected wrong answer. They return and
  render no correct option identifiers, correct answer text, or explanation.
- The incorrect coach says: `Not quite. That answer is locked — keep going.`
- Resume and final-result payloads preserve the same missed-answer boundary.
- Final review contains only correctly answered questions and useful
  explanations.
- The polite live region announces only the result and coach message.
- The speech-bubble tail is vertically centered, seamless, and responsive.
- The worried Andrea asset has a reconstructed left hair contour and transparent
  clearance around every non-baseline edge.
- All face sprites pass an automated alpha-boundary audit.

## Acceptance gates

1. Targeted server and component tests prove the new contracts and fail against
   the baseline implementation.
2. Unit tests, typecheck, lint, build, and the standard verification gate pass on
   the exact branch head.
3. Immediate, resume, and final learner payloads contain no missed-question
   answer identifiers, text, or explanations.
4. Desktop and mobile Chrome proof shows correct feedback once, private wrong
   feedback, full Andrea artwork, and a centered seamless tail.
5. Chrome Network proof confirms missed-answer privacy. The earlier waiver was
   limited to unanswered-question evidence and does not waive this new gate.
6. Three independent manual-review lanes cover UI and accessibility, server
   security, and regression and test quality. Every valid finding is fixed.
7. Claude returns `DONE` with high confidence for the exact reviewed head.
8. Exact-head CI is green. The PR merges through the normal Git-backed Vercel
   path. Production Chrome re-verifies the visible behavior and timing does not
   regress materially from the separate performance baseline.

## Scope boundaries

- One additive database migration may store an immutable, privacy-safe grading
  snapshot (`is_correct`, locked point value and question type, plus
  `explanation` only for new correct responses). It must not store correct
  option identifiers or answer text, and it must preserve the existing score
  calculation and attempt behavior. Legacy responses are graded once during
  migration without copying any authored explanation.
- No implementation from `docs/performance/lesson-load-remediation-plan.md`.
- No production data mutation beyond disposable browser verification state that
  is safe for the authenticated owner account.
- No secret values in source, evidence, prompts, logs, or screenshots.

## Adversarial amendment

The initial no-migration assumption was refuted during independent server
review. Reconstructing a reveal from the current answer key makes historical
privacy mutable: an answer that was wrong when locked can become correct after
an administrator edits the key. The additive immutable snapshot is therefore
required to satisfy the approved immediate, resume, and final-payload contract.
