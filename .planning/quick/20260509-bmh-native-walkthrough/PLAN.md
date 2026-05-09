---
status: in-progress
created: 2026-05-09
---

# BMH Native Walkthrough

Replace hand-built nested walkthrough URLs with a BMH-native walkthrough definition using stable walkthrough id and step params.

## Verification

- RED: BMH step RTL tests failed before the component understood stable walkthrough params.
- GREEN: BMH step unit and RTL tests pass.
- Run npm run verify and npm run build before PR.
- After deploy, run Playwright against production to click through every step.
