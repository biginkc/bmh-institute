---
status: complete
completed: 2026-05-09
---

# Ignore local agent worktrees and Supabase temp files

Completed:

- Added ignore coverage for `.claude/settings.json`, `.claude/worktrees/`, and `supabase/.temp/`.

Verification:

- `git check-ignore .claude/settings.json .claude/worktrees/example supabase/.temp/project-ref`
