# Institute speech bubble pointer alignment

## Goal

- Goal ID: `institute-speech-bubble-pointers`
- Description: Center every speech bubble pointer on the edge it belongs to across the BMH Institute learner surface, including the embedded Talk with Andrea experience.
- Plan source: Jarrad's 2026-07-29 request and production screenshot.
- Authority profile: Production-aware.

## Baseline

- BMH Institute: `origin/main` at `88b6376ee2540478dbb3945ac76cc912a9eb265b`
- Closer Lab Institute embed: `origin/main` at `860a2ea53a1eb6b4265aa28700c002b6374e48c4`
- Production route: `https://institute.bmhgroupkc.com/lessons/823f016f-6e4c-5791-ac42-9f24c28040df?part=role-play-1`
- Baseline screenshot: `/Users/jarradhenry/.codex/visualizations/2026/07/29/019fac81-7ed5-72a3-aab4-da9d96420cd2/institute-speech-bubbles/01-production-baseline.png`

## Plan alignment

- This is scoped UI polish on the existing BMH Institute v1 learner path.
- The current lesson route is served by BMH Institute. Its Talk with Andrea content is rendered by the Closer Lab Institute embed.
- No product behavior, content, database, provider, billing, or secret changes are in scope.

## Acceptance gates

- [x] Every native BMH Institute speech bubble uses the correct left, right, bottom-left, or bottom-right pointer placement.
- [x] Left and right pointers are vertically centered for short and multiline bubbles.
- [x] The Talk with Andrea pointer shown in the supplied production screenshot is vertically centered in the corrected component.
- [x] Native and embedded pointer primitives have durable regression coverage.
- [x] Focused tests, repository verification, and applicable browser checks pass.
- [x] Manual review finds no valid unresolved issue.
- [x] Chrome screenshots are captured and visually examined at desktop and mobile widths.
- [ ] The production BMH Institute route shows the corrected pointer after verified PR merge and deployment.

## Transport and tool preflight

- Claude desktop is installed and running, but no controllable desktop application surface is exposed to this Codex runtime. Classification: `claude_surface_unavailable`.
- Claude Code CLI fallback exists and reports authenticated. It will be used for secret-free review packets.
- Chrome control is connected to the existing authenticated BMH Institute tab.
- GitHub CLI is authenticated. Both repositories and current `origin/main` refs are reachable.
- Isolated worktrees:
  - BMH Institute: `/Users/jarradhenry/Sites/BMH apps/_codex_worktrees/institute-speech-bubble-pointers`
  - Closer Lab: `/Users/jarradhenry/Sites/BMH apps/_codex_worktrees/closer-institute-speech-bubble-pointer`

## Production baseline findings

- The embedded Talk with Andrea bubble is 53 px tall.
- Its 12 px pointer square is anchored with `bottom: 12px`, placing its center 6 px below the bubble center.
- BMH Institute has one native `SpeechBubble` primitive used by all `Coach` placements.
- Native left pointers are centered. Native right-side coaches incorrectly request the `bottom-right` tail instead of a right-edge tail.

## Iterations

### Iteration 1

- Status: Initial investigation and plan.
- Evidence delta: Production screenshot, DOM geometry, component inventory, and cross-repository ownership confirmed.
- Claude verdict: `NEXT_STEP`, confidence high. The two-primitive plan stands and no third active pointer-bearing component was found.
- Codex adversarial evaluation: Accepted. The action is scoped, testable, reversible, secret-free, and crosses no hard gate.
- Transport note: The first Claude CLI invocation used a shell path that was not available inside the worktree. The authenticated absolute CLI path succeeded. Claude's first response was not contract-shaped, so one format correction was requested and returned successfully.

### Iteration 2

- Status: Implementation, independent manual review, and local real-browser proof complete.
- BMH Institute commit/PR: `1fc30b8d1d817a7829b66e7a97dd3aab8a190d0a`, https://github.com/biginkc/bmh-institute/pull/131.
- Closer Lab commit/PR: `0c903fb5f22e15b36841a17760fe9eda4ad2878e`, https://github.com/biginkc/closer-lab/pull/155.
- Regression coverage:
  - Native left/right tail mapping and geometry unit tests.
  - Native mobile browser bounding-box checks for pointer centering, attachment, direction, clipping, and horizontal overflow.
  - Embedded short/multiline browser bounding-box checks at 1280, 390, and 320 px.
- Verification:
  - BMH Institute `npm run verify`: 191 Node files / 1208 tests and 40 RTL files / 160 tests passed.
  - Closer Lab `npm run verify`: 204 Node files / 2022 passed / 3 skipped and 62 RTL files / 421 tests passed.
  - Focused tests and `git diff --check` passed in both repositories.
  - Fallow: no new issues in either changed-file scope. Inherited dependency findings remain outside the PRs.
  - Institute changed-file ESLint passed. Closer changed-file ESLint is unavailable because the repository has ESLint 9 but no flat `eslint.config.*`; typecheck and both Vitest suites passed.
  - Local Playwright runner could not launch because its configured Chromium headless-shell binary is not installed. Chrome plugin execution covered the same geometry in the user's actual Chrome. The committed E2E specs remain available for CI.
- Independent review:
  - Geometry/contract reviewer: no implementation finding; required deployed cross-app proof before acceptance.
  - UX/visual reviewer: no implementation finding; required desktop/mobile screenshots and exact center measurement.
  - Test-quality reviewer: identified that JSDOM class assertions were insufficient and fake multiline cases added no signal. Both findings were addressed with browser geometry specs and simplified unit tests. Re-review: no findings.
- Chrome measurements:
  - Native desktop left/right center deltas: `0` and `0.00390625` CSS px.
  - Native 390 px left/right center deltas: `0` and `0.00390625` CSS px; `scrollWidth=390`.
  - Native 320 px left/right center deltas: both `0` CSS px; `scrollWidth=320`.
  - Embedded desktop short/multiline center deltas: approximately `0.0000038` and `0` CSS px.
  - Embedded 390 px short/multiline center deltas: approximately `0.0000076` and `0` CSS px; `scrollWidth=390`.
  - Embedded 320 px short/multiline center deltas: approximately `0.0000076` and `0` CSS px; `scrollWidth=320`.
  - Every embedded pointer overlaps its bubble edge by approximately `9.99` CSS px, with matching white backgrounds and no visible gap or doubled border.
- Examined screenshots:
  - `05-native-coaches-desktop.png`
  - `06-native-bottom-tails-desktop.png`
  - `07-native-coaches-390.png`
  - `08-native-coaches-320.png`
  - `09-embedded-bubbles-desktop-local.png`
  - `10-embedded-bubbles-390-local.png`
  - `11-embedded-bubbles-320-local.png`
- Evidence caveat: the red Next development badge in native local screenshots is caused by the Scribe browser extension adding `data-scribe-recorder-ready` before React hydration. It is unrelated to the speech-bubble code and is absent from production.

### Iteration 3

- Status: Post-code convergence review.
- Claude verdict: `NEXT_STEP`, confidence high.
- Reasoning: Both PRs and local Chrome proof are strong, but CI and post-deploy production verification remain open.
- Proposed action: Wait for both PR heads to pass CI, merge Closer Lab before BMH Institute, then capture desktop and mobile Chrome proof on the live Institute lesson.
- Codex adversarial evaluation: Accepted. This preserves the final automated gate and tests the exact cross-app composition that exposed the original defect.
- Hard-gate risk: none.

### Iteration 4

- Status: Exact-head CI and final merge-readiness review complete.
- BMH Institute reviewed head: `636cfa15bfab9ddd451e1f6023baec57975ba80f`.
- Closer Lab reviewed head: `de11ae4e346d17e3493b21ef69d414d98e3d4398`.
- CI:
  - Institute Verify, Seeded Playwright E2E, and Vercel preview passed.
  - Closer Verify, Playwright golden paths, and test-database migration checks passed.
- Final test-only follow-up: Closer's inherited lease-TTL test now freezes and restores `Date.now()` per test. This removed the demonstrated 115-to-114 and 25-to-24 wall-clock race without changing product behavior. Focused, full local, CI, and independent test-quality review all passed.
- Claude verdict: `NEXT_STEP`, confidence high.
- Proposed action: Merge Closer PR #155, then Institute PR #131. Do not dispatch the Closer production worker/web release workflow or mutate live voice/rollout state without Jarrad's explicit authorization.
- Reasoning: Both merges are verified UI-only changes. Closer deliberately separates `main` from production; its only reviewed release workflow deploys a matched worker/web pair, resets member/embed rollout to `off`, and requires a fresh ten-session provider-readiness chain before promotion. That operational release is a later hard gate, not a reason to strand reviewed code.
- Codex adversarial evaluation: Accepted. A web-only Railway deploy would violate the matched release-state contract, while the paired workflow would intentionally disable live voice. Neither is authorized by the merge gate or safe to infer from this UI request.
- Residual production gate: Native Institute bubbles can ship through the normal Vercel merge deployment. The Andrea iframe bubble remains on the current Closer production SHA until the separate paired release is explicitly authorized and completed.
