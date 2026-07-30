# Regenerating a course lesson

Rendered media is **not** in git. ~55GB of renders, ProRes transcodes and
generated clips were removed deliberately. This file is the contract for
getting a lesson back.

## What is versioned vs not

| | Where |
|---|---|
| Build + generation scripts, shotlists, Remotion compositions, manifests, `_anchors/` | git (this repo) |
| Finished lesson videos (29) | Google Drive — "BMH Course — FINAL Videos" |
| Generated source media (HeyGen clips, Seedance animation, TTS `.wav`/`master.m4a`, scene stills) | **Neither.** Regenerated on demand — see below |

Generated source media is intentionally disposable: it comes from paid
stochastic providers and is reproduced by the `gen_*.py` scripts. Re-running
them costs provider spend and does **not** return byte-identical output, so a
regenerated lesson will differ visually from the shipped cut. The shipped cuts
are the ones in Drive.

## Order of operations

1. `cd docs/course-production/remotion && npm ci` — installs Remotion (pinned by `package-lock.json`).
2. Generate the lesson's source media: `python3 ../scripts/gen_audio_<lesson>.py`, plus any `gen_andrea_*`/scene-art scripts for that lesson. These call the providers and write into `course-assets/`.
3. Build the manifest: `python3 ../scripts/build_manifest_<lesson>.py` — normalizes clips, runs the ffmpeg ProRes-4444/alpha transcodes, and writes `remotion/public/<lesson>/manifest.json`.
4. Render: `npx remotion render src/index.ts <Composition> out/<lesson>.mp4`.
5. QC before publishing — see `PLAYBOOK.md` and `_QC-QUEUE.md`.

## Prerequisites not captured by this repo

- `ffmpeg` and `ffprobe` on PATH (no version is pinned; ProRes 4444 with
  `yuva444p10le` support required)
- `xxd`
- HeyGen credentials at `~/.config/bmh-course/heygen.key`, plus provider API
  access for TTS and animation
- Python 3 with the scripts' imports available

## Portability

Scripts derive the repo root rather than hardcoding it:

- Python/shell: `BMH_ROOT` / `${BMH_INSTITUTE_ROOT:-...}` resolved from the
  script's own location (`docs/course-production/scripts/../../..`)
- Override with `BMH_INSTITUTE_ROOT=/path/to/checkout` if running from elsewhere

They therefore operate on **the checkout they live in**, so a worktree or a
clean clone builds into itself rather than writing back to another checkout.

## Known gap: some Seedance animation recipes were not preserved

Scene stills are fully reproducible — the generating prompt for each is kept
in `course-assets/scenes/<module>/_logs/<beat>.log` (mirrored to Drive). But a
few lessons' Seedance animation job records were lost with the deleted media;
lesson 10A's `anim_b03/b08/b09` have no surviving recipe. The underlying stills
survive, so those beats can be re-animated, but not to the same recipe. The
shipped cuts remain intact in Drive.

## Typechecking

`docs/course-production/**` is excluded from the app's `tsconfig.json` — the
root `include` is `**/*.ts(x)`, so without the exclusion the Remotion
compositions get pulled into the Next.js project (where their dependencies do
not resolve; `tsc` OOM'd at 4GB). The Remotion project typechecks itself:

```
cd docs/course-production/remotion && npm run typecheck
```
