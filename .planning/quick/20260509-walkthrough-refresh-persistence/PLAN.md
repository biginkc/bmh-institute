---
status: in-progress
created: 2026-05-09
---

# Walkthrough Refresh Persistence

Persist active walkthrough overlay state in session storage so the wizard remains visible after refresh or navigation that drops query parameters.

## Verification

- RED: focused RTL tests failed before session persistence existed.
- GREEN: focused RTL tests pass after persistence implementation.
- Run npm run verify and npm run build before PR.
