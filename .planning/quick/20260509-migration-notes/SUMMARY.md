# Migration notes summary

## Result

Added top-level `MIGRATION-NOTES.md` for BMH Institute. It records runtime and package-manager state, environment variable names, Supabase projects and migrations, CI workflows, scheduled jobs, route handlers, custom scripts, Vercel details, path-sensitive surprises, and migration-day reminders.

## Verification

- Read platform monorepo planning docs under `/Users/jarradhenry/Sites/BMH apps/bmh-platform-planning/`.
- Read `/Users/jarradhenry/Sites/BMH apps/AGENTS.md`.
- Inventoried `package.json`, `.env.example`, `.github/workflows/`, `supabase/`, `next.config.ts`, route handlers, scripts, and path-sensitive references.
- `npm run verify`: passed after `npm ci` installed this worktree's dependencies.
