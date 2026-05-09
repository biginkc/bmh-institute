---
status: in-progress
created: 2026-05-09
branch: codex/20260509-003949-bmh-local-agent-ignores
---

# Ignore local agent worktrees and Supabase temp files

Goal: prevent local agent workspace folders and Supabase CLI cache files from polluting `git status`.

Scope:

- Ignore `.claude/worktrees/` because those are local agent workspaces and can be large.
- Ignore `.claude/settings.json` because it is local Claude permission config like `settings.local.json`.
- Ignore `supabase/.temp/` because it is Supabase CLI cache state.
- Run a focused Git ignore check.

Out of scope:

- App code changes.
- Removing or preserving project planning docs.
