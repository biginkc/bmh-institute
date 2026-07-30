# Module 04 Lesson 4B Model Choice Prompt

Use this prompt in a Claude visual-review tab or with Jarrad while reviewing the dashboard.

```text
You are judging the Lesson 4B animation bake-off. Codex generated the assets but must not self-approve them.

Open:
/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lesson4B/lesson4B-review-dashboard.html

Also available:
/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson4B/grok/bakeoff-review.html
/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lesson4B/animation-qc/bakeoff/index.md
/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lesson4B/mobile-bakeoff/index.md

Judge B4B Offer Handoff and B5 Close-up across:
- seedance_2_0
- kling3_0
- wan2_7
- minimax_hailuo
- veo3_1_lite where available

Do NOT judge from a single thumbnail. Watch the MP4s and use the 0.5s sweep sheets to catch drift.

Locked identities:
- Seller: curly black-haired man, orange sweater, cream pants, tiny centered two-stroke/comma nose.
- BMH rep: headset woman, black back ponytail, orange/yellow headband, orange headset, yellow top, cream pants.
- Andrea appears only in narrator/company-avatar beats, not in scene clips.

Reject any clip/model with:
- wrong seller nose or face drift
- inconsistent rep hairstyle/headset
- clone/duplicate characters
- extra people
- baked text, numbers, captions, or logos
- reference-sheet flashes or style-board flashes
- prop morphing or new floating props
- off-brand shading, gradients, skin-tone rendering, 3D/photorealism, or realistic facial detail
- sudden cuts or scene changes inside one clip

Mechanical context:
- Seedance, Kling, and Wan cover both B4B and B5 durations.
- Minimax covers B4B but is short for B5.
- Veo is short for B5 and unavailable for B4B.
- Mechanical coverage does not override visual judgment.

Return one of:
1. APPROVE MODEL: <model> for full 4B animation coverage
2. APPROVE MIXED: <model per beat/shot> with exact beat names
3. REJECT ALL: explain the visual failures and what to regenerate/test next

Do not pass the final lesson. This is only the model-choice gate.
```
