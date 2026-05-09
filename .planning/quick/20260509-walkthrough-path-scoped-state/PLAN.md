# Walkthrough path-scoped state

## Goal

Prevent stale walkthrough overlay state from restoring on the wrong application route.

## Scope

- Store the pathname with every saved walkthrough state.
- Restore saved walkthrough state only when the current pathname exactly matches the saved pathname.
- Keep the behavior generic across all walkthrough steps and caption-driven walkthroughs.
- Preserve refresh persistence on the same route.

## Verification

- Add a regression test that stores walkthrough state for one path and renders on another path.
- Run the focused RTL test file.
- Run `npm run verify`.
- Run `npm run build`.
- Recheck production walkthrough navigation and stale-state behavior after deploy.
