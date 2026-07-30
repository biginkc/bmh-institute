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

## Known limitation: scripts are machine-specific

The `gen_*` and `build_manifest_*` scripts hardcode the absolute repo path
`/Users/jarradhenry/Sites/BMH apps/BMH Institute`. They run on Jarrad's
machine as-is; **a clean clone elsewhere requires editing those paths.** This
is pre-existing and was not introduced by versioning them. Making the root
derived rather than hardcoded is a worthwhile follow-up, deliberately kept out
of the commit that merely puts these files under version control.

## Typechecking

`docs/course-production/**` is excluded from the app's `tsconfig.json` — the
root `include` is `**/*.ts(x)`, so without the exclusion the Remotion
compositions get pulled into the Next.js project (where their dependencies do
not resolve; `tsc` OOM'd at 4GB). The Remotion project typechecks itself:

```
cd docs/course-production/remotion && npm run typecheck
```
