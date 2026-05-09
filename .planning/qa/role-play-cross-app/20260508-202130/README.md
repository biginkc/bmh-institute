# Role-play cross-app verification artifacts

Captured during PR #35 verification for the BMH Institute role-play embed and Closer Lab completion listener.

Source worktree:

`/Users/jarradhenry/Sites/BMH-Institute-codex-20260508-193554-bmh-role-play-listener`

Artifact set:

- `01-bmh-lesson-with-closer-iframe-briefing.png`: BMH lesson rendering the embedded Closer Lab briefing.
- `02-closer-iframe-briefing-content.png`: Closer Lab briefing content inside the iframe.
- `03-bmh-page-with-active-closer-runtime.png`: BMH lesson while the embedded role-play runtime is active.
- `04-closer-iframe-active-runtime.png`: Closer Lab active runtime inside the iframe.
- `05-bmh-page-after-rp-complete.png`: BMH lesson after role-play completion is posted back.
- `06-closer-iframe-after-complete.png`: Closer Lab iframe after completion.
- `07-bmh-lesson-reloaded-after-completion.png`: BMH lesson reload preserving completion state.
- `08-db-proof-page.png`: Browser-rendered database proof.
- `08-db-proof.html`: HTML database proof artifact.
- `summary.json`: Structured capture metadata with seeded lesson URL, role-play block content, progress row, and result row.

Verification note:

The copied artifacts preserve evidence that the embedded Closer Lab role play completed, posted back to BMH Institute, persisted `user_block_progress`, and wrote a `role_play_results` row.
