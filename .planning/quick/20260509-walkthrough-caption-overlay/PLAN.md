---
status: in-progress
created: 2026-05-09
---

# Walkthrough Caption Overlay

Add an app-native bottom caption overlay for guided demos, gated by the walkthroughCaption URL parameter. This avoids browser script injection and keeps the annotation visible without covering the application.

## Verification

- RED: focused RTL test fails before component exists.
- GREEN: focused RTL test passes after component and root layout mount.
- Run npm run verify before commit.
