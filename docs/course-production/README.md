# Course Production — BMH Follow-Up Specialist training videos

Production pipeline for the 19-module course delivered by this app. **Git tracks the recipe (text); the images/videos are regenerable build outputs and are gitignored.**

## Layout
- `visual-bible/` — the locked look: `01-cast-sheet` (the 12 characters), `02-style-guide` (the sticker-system rules), `03-object-set` (recurring props). Source of truth for style.
- `shotlists/` — per-module composition prompts (`module-NN-shotlist.md`) + manifests. This is what gets fed to the image generator.
- `../design/` — the 4 canonical style reference images (the visual DNA the generator matches against).
- `../../course-assets/` — **gitignored.** Generated PNGs/MP4s land here (`cast/ objects/ library/ scenes/module-NN/`). Regenerate anytime from the shotlists; never commit.

## Naming
`m01_LA_s03_people-burden.png` = module 01, lesson A, scene 03, tag. Reusable library items drop the prefix: `lib_funnel.png`.

## Pipeline
Style block (from `../design/` refs) → Codex `gpt-image-2` generates each shotlist prompt to `course-assets/` → review → HeyGen composites Andrea over each background → module renders.

## Scripts source
Transcripts + quizzes remain canonical in the vault (`~/BMH-OS/BMH Training Course/Thinkific/`). This folder is delivery-side production only.
