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

- [ ] Every native BMH Institute speech bubble uses the correct left, right, bottom-left, or bottom-right pointer placement.
- [ ] Left and right pointers are vertically centered for short and multiline bubbles.
- [ ] The Talk with Andrea pointer shown in the supplied production screenshot is vertically centered.
- [ ] Native and embedded pointer primitives have durable regression coverage.
- [ ] Focused tests, repository verification, and applicable browser checks pass.
- [ ] Manual review finds no valid unresolved issue.
- [ ] Chrome screenshots are captured and visually examined at desktop and mobile widths.
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
