# DSF-02 convergence ledger

## Goal and plan alignment

- Goal ID: `DSF-02`
- Goal: Port the exact 15-component typed BMH design-system library, add the unlinked QC route and required smoke tests, then open an unmerged PR.
- Plan source: User work package plus `.planning/quick/260715-wii-dsf-02-port-the-exact-15-component-typed/260715-wii-PLAN.md`.
- Baseline: `fa23430`, merged DSF-01 on `origin/main`.
- Authority profile: Local code and GitHub PR creation only. Merge is explicitly forbidden.

## Acceptance gates

- [x] Fifteen exact public prop interfaces and named component exports.
- [x] Faithful source rendering with documented integration-only deviations.
- [x] Required RTL smoke tests pass.
- [x] Unlinked `/design-system` renders all main variants.
- [x] `npm run verify`, `npm run build`, and diff checks pass.
- [ ] Manual review and independent Claude review have no unresolved valid findings.
- [x] Requested PR is open against `main` and is not merged.

## Preflight

- Worktree and branch match the user-provided scope.
- `npm install` completed without modifying the lockfile.
- Claude CLI exists and reports authenticated. Desktop control will be checked before using the CLI fallback.
- Local browser proof requires only the dev server and Chrome. No provider or production side effects are in scope.

## Iterations

### Implementation and source contract

- Added 15 named TypeScript components and the `src/components/bmh-ds/index.ts` barrel.
- Mechanical interface comparison matched all 15 source declarations after ignoring comments and quote or whitespace formatting.
- Preserved the kit's undeclared runtime `style` and DOM attributes through private runtime intersections without widening any exported interface.
- Restored direct source DOM composition for Coach and Logo plus defensive source fallbacks for variant maps and Table inputs.
- Deliberate deviations are limited to DSF-01 collision-safe variable names, `/brand/mascot` defaults, Lucide React for fixed glyphs, nonvisual accessibility semantics, and zero progress for a non-positive maximum.

### Tests and routes

- Required Button, Input, ProgressBar, and locked LessonCard RTL coverage passes.
- Added regression coverage for Input semantics, Mascot runtime attributes, ChapterItem disabled state, SearchBar naming, Table action semantics, and keyboard activation.
- Latest `npm run verify`: typecheck passed, 60 unit files with 258 tests passed, and 13 RTL files with 29 tests passed.
- Latest `npm run build`: Next.js 16.2.4 production build passed.
- Production server probe returned 404 for `/design-system`. A development server probe returned 200 and contained the complete specimen markers.
- Connected browser runtime reported no available browser. HTTP and build proof are complete, but human screenshot review at desktop and narrow widths remains a review activity rather than an implementation blocker.

### Adversarial review

- Fixed dropped runtime `style` and DOM attributes, extra brand DOM wrappers, missing source fallbacks, and undocumented zero-maximum handling.
- Split the specimen into a production-gated Server page and Client specimen. Production now returns 404 while development bypasses auth only for the exact design-system path.
- Added the missing password lock glyph and orange LessonCard specimen.
- Fixed Input, ProgressBar, LessonCard, ChapterItem, SearchBar, and Table accessibility findings.
- Table retains native row semantics. A real named button in the first cell exposes each action to assistive technology while row-wide pointer activation remains. It is visually hidden at rest and reveals an outlined Open control when keyboard-focused.
- Fallow reported only intentional public export and source-complexity signals. Secret and environment scans were clean.
- Source-contract, runtime, and interaction re-reviews are clean at `b52359d`.

### PR and Claude gate

- PR 86 is open from `codex/design-system-02-components` to `main` with the exact requested title. It is not merged.
- GitHub Verify, Seeded Playwright E2E, Vercel, and Vercel Preview Comments checks passed at `64dc871`.
- Claude Desktop was reached and a fresh conversation was opened. Its main window then rendered blank and could not expose a controllable review surface.
- The authenticated CLI fallback was attempted in read-only plan mode. It returned HTTP 401 because the stored OAuth access token has expired.
- No Claude verdict was received. The implementation reviews are clean but the required independent Claude gate remains blocked on re-authentication or a working Desktop surface.
