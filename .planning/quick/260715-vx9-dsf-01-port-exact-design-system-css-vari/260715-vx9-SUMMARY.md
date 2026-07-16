---
quick_task: 260715-vx9
status: complete
completed: 2026-07-15
implementation_commit: e6bc843
---

# DSF-01 design-system foundation summary

## Delivered

- Added all 131 declarations from the BMH Institute color, typography, and spacing token sources.
- Loaded Baloo 2 weights 500, 600, 700, and 800 plus Nunito Sans weights 400, 600, 700, and 800 through `next/font/google` CSS variables.
- Preserved Geist as the active route font. The new brand fonts expose variables only.
- Added the 14 top-level Andrea mascot PNG files under `public/brand/mascot/` with source filenames and bytes unchanged.
- Added a self-contained regression contract for exact declarations, collision mappings, font setup, filenames, and PNG SHA-256 hashes.

## Collision handling

The imported Sandra and Tailwind token sources already own 12 incoming names. The new tokens use these mapped names:

- `--font-mono` to `--bmh-font-mono`
- `--radius-xs` to `--bmh-radius-xs`
- `--radius-sm` to `--bmh-radius-sm`
- `--radius-md` to `--bmh-radius-md`
- `--radius-lg` to `--bmh-radius-lg`
- `--radius-xl` to `--bmh-radius-xl`
- `--radius-2xl` to `--bmh-radius-2xl`
- `--shadow-xs` to `--bmh-shadow-xs`
- `--shadow-sm` to `--bmh-shadow-sm`
- `--shadow-md` to `--bmh-shadow-md`
- `--shadow-lg` to `--bmh-shadow-lg`
- `--ease-out` to `--bmh-ease-out`

Each rename has an adjacent mapping comment in the ported CSS.

## Verification

- Focused contract: 5 tests passed.
- `npm run verify`: typecheck passed, 256 unit tests passed, and 19 RTL tests passed.
- `npm run build`: Next.js 16.2.4 production build passed.
- Mechanical comparison: 131 token declarations matched the source after only the 12 collision renames and two required font-variable substitutions.
- Mascot comparison: 14 filenames and 14 file contents matched the source.
- Additive visual proof: no component, route, body class, Geist class, Sandra import, or global element rule changed. The only existing runtime files changed were `globals.css` imports and unused font-variable setup in `layout.tsx`.
- Optional `npm run lint`: existing failures remain in `src/lib/integrations/sandra/course-completed.ts` for two `no-explicit-any` errors outside this diff. DSF-01 added no lint errors.

## Commits

- `bbdb322` plans the scoped quick task.
- `e6bc843` adds the design-system foundation and regression contract.
