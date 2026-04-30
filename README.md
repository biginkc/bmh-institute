# BMH Institute

Internal training platform for BMH Group VAs. Isolated Next.js app with its own Supabase project; shares UI language and technical patterns with Sandra CRM. (Renamed from Sandra University on 2026-04-30.)

See [AGENTS.md](./AGENTS.md) for development conventions and [bmh-training-platform-spec.md](./bmh-training-platform-spec.md) for the full build spec.

## Getting started

```bash
npm install
npm run dev
```

App runs at http://localhost:3100.

## Scripts

- `npm run dev` — next dev on port 3100
- `npm run build` / `npm start` — production build + start
- `npm run test` — vitest unit
- `npm run test:integration` — vitest against real Supabase (requires `.env.test.local`)
- `npm run test:e2e` — playwright
- `npm run typecheck` — tsc --noEmit
- `npm run verify` — typecheck + unit tests (pre-commit gate)
- `npm run lint` — eslint

## Environment

Copy `.env.example` → `.env.local` and fill in the `replace_me` values.
