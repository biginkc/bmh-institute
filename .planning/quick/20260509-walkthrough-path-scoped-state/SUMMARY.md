# Walkthrough path-scoped state summary

## Result

Saved walkthrough overlay state is now scoped to the route pathname where it was created. Refreshing the same walkthrough route still restores the overlay, but navigating to a different route without walkthrough parameters ignores stale saved state. This applies to every walkthrough step and to caption-driven walkthrough state.

## Verification

- `npm run test:rtl -- src/components/walkthrough-caption-overlay.test.tsx`: passed.
- `npm run verify`: passed.
- `npm run build`: passed.
