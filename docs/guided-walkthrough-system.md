# Guided walkthrough system

This plan turns the BMH Institute walkthrough prototype into a reusable direction for Sandra, Closer Lab, BMH Institute, Jitter, and future BMH apps.

## Current state

BMH Institute has a working app-native walkthrough prototype:

- URL-driven walkthrough id and step state.
- Bottom overlay with Back and Next controls.
- Same-route refresh persistence through `sessionStorage`.
- Path-scoped restore so stale saved state cannot appear on another route.
- Durable walkthrough content seeded into production for onboarding and demos.
- Production Playwright proof across all six steps.

The prototype lives in:

- `src/components/walkthrough-caption-overlay.tsx`
- `src/lib/walkthrough/bmh-demo.ts`
- `src/lib/walkthrough/curriculum.ts`

## Decision

Do not create a shared package yet.

The BMH Platform monorepo plan uses the rule of three for shared packages. A package should be created only when at least three apps need the same code, or when the code is platform infrastructure. The walkthrough system is close to platform UX infrastructure, but only BMH Institute has a proven implementation today.

Recommended path:

1. Keep the BMH Institute implementation app-local for now.
2. Extract the app-agnostic contract and lessons learned into documentation.
3. When a second app needs a walkthrough, copy the small app-local implementation and keep the step contract compatible.
4. When a third app needs the same behavior, extract `@bmh/guided-walkthrough` in the BMH Platform monorepo.

## Future package shape

Candidate package name:

- `@bmh/guided-walkthrough`

Candidate package location after monorepo migration:

- `packages/guided-walkthrough/`

The package should include:

- Step definition types.
- URL helpers.
- Session restore helpers.
- Path-scoped state validation.
- A headless state hook.
- A default overlay component that apps can style or wrap.
- Unit tests for navigation, refresh, stale path restore, and disabled boundaries.

The package should not include:

- BMH Institute course ids.
- App-specific captions.
- LMS content seeding.
- Any direct Supabase access.
- Any cross-app imports.
- Any browser extension or script-injection runtime.

## Step contract

Each app should define its walkthrough steps with this shape:

```ts
export type GuidedWalkthroughStep = {
  id: string;
  step: number;
  path: string;
  caption: string;
  title?: string;
};
```

Rules:

- `id` identifies the walkthrough, for example `bmh-institute-demo`.
- `step` is one-based and stable.
- `path` is the route pathname without query params.
- `caption` is plain app copy shown in the overlay.
- Generated links use `?walkthrough=<id>&step=<number>`.
- Stored state includes the pathname and restores only when `stored.path === window.location.pathname`.
- Back and Next use plain anchors unless the app proves its router link works reliably from a fixed global overlay.

## Overlay contract

The overlay should:

- Stay visible until the walkthrough leaves the current route or reaches a disabled boundary.
- Render at the bottom of the viewport.
- Use Back and Next controls.
- Disable Back on the first step.
- Disable Next on the final step.
- Avoid covering the whole app.
- Keep text readable over app content.
- Use `role="status"` and `aria-live="polite"`.
- Avoid injected browser scripts.

## State model

Use URL state as the source of truth when present.

Use `sessionStorage` only as a same-path refresh fallback:

```ts
type StoredWalkthroughState = {
  id: string;
  step: number;
  caption: string;
  backHref: string | null;
  nextHref: string | null;
  path: string;
};
```

Restore rules:

- If URL params define a valid walkthrough step, render that step and save it.
- If URL params are absent, read session storage.
- If no saved state exists, render nothing.
- If saved state has no path, render nothing.
- If saved path differs from the current pathname, render nothing.
- Never restore a stale step on another route.

## Implementation phases

### Phase A: BMH Institute polish

Keep this app-local.

- Add a small shared helper module inside BMH Institute for URL and storage behavior.
- Keep BMH-specific step definitions in `src/lib/walkthrough/bmh-demo.ts`.
- Preserve the existing production behavior.
- Add tests for helper functions if the component grows.

### Phase B: second-app trial

When Sandra, Closer Lab, or Jitter needs its first app-native walkthrough:

- Copy the BMH Institute pattern into that app.
- Keep the same step contract.
- Change only app-specific routes, copy, and styling.
- Record any differences in that app's `MIGRATION-NOTES.md` or planning docs.

### Phase C: package extraction

When three apps have the same needs:

- Create `@bmh/guided-walkthrough` in the BMH Platform monorepo.
- Move generic types, URL helpers, storage helpers, and headless hook into the package.
- Keep app step definitions app-local.
- Keep app content seeding app-local.
- Verify all consuming apps build from the monorepo root.

## Acceptance criteria for issue #64

Issue #64 should stay open until at least one of these is true:

- A second BMH app consumes the same walkthrough contract and the issue is updated with what changed.
- The monorepo has enough app consumers to extract `@bmh/guided-walkthrough`.

The issue can be closed after:

- Three apps use the same walkthrough contract.
- The shared package, or an explicitly chosen non-package alternative, is documented in the BMH Platform monorepo.
- BMH Institute consumes the shared system without losing its current walkthrough behavior.

## Known risks

- Premature package extraction would violate the platform rule of three.
- Browser-injected overlays are unreliable and should not be the foundation.
- URL-only state can fail on refresh or route transitions.
- Session-only state can restore stale steps unless it is path-scoped.
- App-specific routes and copy should not leak into shared code.
