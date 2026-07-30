# Module 04 Lesson 4B Full Animation Production Plan

Status: full mixed-model animation clips generated; waiting on Jarrad/Claude clip-by-clip visual approval.
Codex does not visually approve clips.

Selected policy:

- `b04b_offer`: `kling3_0`
- `b05_step5_close`: `seedance_2_0`
- Remaining animated beats: `seedance_2_0`, pending individual clip review

## Selected-Model Workflow

Generated full-coverage clips are here:

`/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson4B/grok/full/mixed_kling_b4b_seedance_b5/`

Filename pattern:

`<beat_tag>_part01.mp4`, `<beat_tag>_part02.mp4`, etc.

After Jarrad/Claude approves the full clips, run the guarded finalizer:

`python3 docs/course-production/scripts/finalize_lesson4B_after_animation.py --model mixed_kling_b4b_seedance_b5`

The finalizer validates full clip coverage, runs the mechanical 0.5s sweep, rebuilds the manifest, renders `LESSON-4B-v1.mp4`, appends the QC queue row, and reruns the goal audit. It refuses to render if required full-coverage clips are missing or short.

Use this to re-check clip coverage without rendering:

`python3 docs/course-production/scripts/finalize_lesson4B_after_animation.py --model mixed_kling_b4b_seedance_b5 --check-only`

## Clip Count By Beat

Exact durations come from `course-assets/heygen/lesson4B/_state.json`.

| Beat | VO duration | Seedance 2.0 / Kling 3.0 / Wan 2.7 max 15s | Minimax max 10s | Veo Lite max 8s |
|---|---:|---:|---:|---:|
| `b02_step1_intro` | 9.14s | 1 clip | 1 clip | 2 clips |
| `b03_step2_factfind` | 14.16s | 1 clip | 2 clips | 2 clips |
| `b04a_pitch` | 12.59s | 1 clip | 2 clips | 2 clips |
| `b04b_offer` | 9.95s | 1 clip | 1 clip | 2 clips |
| `b05_step5_close` | 11.65s | 1 clip | 2 clips | 2 clips |
| `b06_structure_vs_execution` | 24.58s | 2 clips | 3 clips | 4 clips |
| `b07_8020_rule` | 33.07s | 3 clips | 4 clips | 5 clips |
| `b08_slow_down` | 15.70s | 2 clips | 2 clips | 2 clips |

## Required Adjacent Shots

- `b02_step1_intro`: one five-card framework shot; cards/token subtly move; no baked text.
- `b03_step2_factfind`: one rep-listening/seller-talking shot for 15s models; split into seller-talk and rep-note-listen if using shorter models.
- `b04a_pitch`: one property/pitch shot for 15s models; split property visual and rep gesture if using shorter models.
- `b04b_offer`: handoff/offer shot. Existing bake-off clips can cover this duration if the same model wins and Jarrad/Claude approves that specific clip.
- `b05_step5_close`: headset-rep close-up. Existing bake-off clips can cover this duration for Seedance/Kling/Wan if that model wins and Jarrad/Claude approves that specific clip; Minimax/Veo need adjacent coverage or a tiny final-frame buffer decision.
- `b06_structure_vs_execution`: adjacent framework/pipeline shots, not one repeated loop.
- `b07_8020_rule`: adjacent human-situation shots; no background house icon; seller remains primary.
- `b08_slow_down`: adjacent slow relationship/listening shots; exact rep and seller identities; no racing token.

## Gate

Every generated clip must be reviewed individually. Codex may verify file existence, duration, resolution, silence, and that the manifest consumes the clips, but Jarrad/Claude judges face/nose correctness, character drift, brand fit, and model choice.
