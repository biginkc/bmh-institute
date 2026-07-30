# Module 04 Lesson 4B Assembly Review

Status: deterministic static timing draft only. This is not a final animated cut and is not visually approved by Codex.

Still gate: Jarrad-approved in the main Codex thread on 2026-07-05. Next gate: Jarrad/Claude model choice from the B4B/B5 bake-off.

## Files

- Static timing draft: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lesson4B/LESSON-4B-static-timing-draft.mp4`
- Frame proof sheet: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lesson4B/LESSON-4B-static-frame-sheet.jpg`
- Review dashboard: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lesson4B/lesson4B-review-dashboard.html`
- Remotion manifest: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/docs/course-production/remotion/public/lesson4B/manifest.json`
- Animation bake-off review: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/docs/course-production/shotlists/module-04-lesson4B-animation-bakeoff.md`
- Full animation production plan: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/docs/course-production/shotlists/module-04-lesson4B-animation-production-plan.md`
- Animation prompt pack: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/docs/course-production/shotlists/module-04-lesson4B-animation-prompts.md`
- Model-choice prompt: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/docs/course-production/shotlists/module-04-lesson4B-model-choice-prompt.md`
- Current gate handoff: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/docs/course-production/shotlists/module-04-lesson4B-current-gate.md`
- Bake-off mechanical sweep: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lesson4B/animation-qc/bakeoff/index.md`
- Mobile bake-off GIFs: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lesson4B/mobile-bakeoff/index.md`
- Post-selection animation queues: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lesson4B/animation-queue/index.json`
- Goal completion audit: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lesson4B/LESSON-4B-goal-audit.md`
- Post-animation finalizer: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/docs/course-production/scripts/finalize_lesson4B_after_animation.py`
- Finalizer report: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lesson4B/LESSON-4B-finalize-report.md`

## Mechanical Verification

- `build_manifest_4B.py` produced 10 beats, 4818 frames, 160.60s at 30fps, with no missing source assets.
- Render output is 1600x900, 30fps, with video and audio streams, duration 160.66s.
- Master audio is 160.59s and includes 1.0s inter-beat gaps.
- Normalized stills in `remotion/public/lesson4B/stills/` are all 1600x900.
- Proof frame sheet shows nonblank frames across the draft.
- Bake-off mechanical sweep generated 9 per-clip 0.5s contact sheets. Seedance/Kling/Wan cover B4B and B5 durations; Minimax covers B4B but is short for B5; Veo is short for B5 and unavailable for B4B.
- Post-selection animation queues generated for all candidate models. Seedance/Kling/Wan require 12 clips, Minimax requires 17 clips, and Veo requires 21 clips for full B2-B8 coverage under the no-loop rule.
- Goal audit generated and currently reports incomplete/gated because full animation, final render, QC queue handoff, and final PASS are not present yet.
- `finalize_lesson4B_after_animation.py --model <approved-model> --check-only` fails fast until every full-coverage clip exists under `course-assets/heygen/lesson4B/grok/full/<model>/`.

## Finalize Command After Model Approval

Only run this after Jarrad/Claude chooses the model and the full queued clips have been generated:

```bash
python3 docs/course-production/scripts/finalize_lesson4B_after_animation.py --model <approved-model>
```

The script validates clip coverage, creates the full animation sweep, rebuilds the manifest, renders `course-assets/review-lesson4B/LESSON-4B-v1.mp4`, appends the QC queue row, and reruns the goal audit. It does not approve the final cut.

## Gate

Jarrad/Claude still must choose the animation model winner from the B4B/B5 bake-off before Codex generates full animation coverage. Codex has not approved face/nose correctness, animation quality, model choice, or final visual readiness.
