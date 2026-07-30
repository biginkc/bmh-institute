# Video Pipeline — Motion Architecture (reference of record)

**Locked 2026-07-03.** How still doodle scenes become finished module videos. The still art is already proven (Codex `gpt-image-2`, judged flat/on-brand). This doc covers the **motion** layer on top.

## The three layers — who animates what

| Layer | Owns | Notes |
|---|---|---|
| **HeyGen** | **Andrea only** — the narrative performance | Avatar IV (defined mouth). Voice = Hope. Andrea is NEVER animated by Grok. **Her on-screen presence varies by beat** — one of `hero-solo` / `corner-circle` / `voice-only` / `side-full` (see `scene-card-v2.md`). Not always a corner circle. |
| **Grok** (Higgsfield) | **Everything that is not Andrea** — backgrounds and the other doodle characters | Drop-in `<OffthreadVideo>` clips that add organic motion/life to still art. Model: **Grok Video** (`grok_video`). |
| **Remotion** | **Transitions + composite** — brings every layer together | Code-driven. Timeline is the narration clock (Whisper/HeyGen word-timestamps → timing JSON → start-frames). Element animation where precision matters. |

## The isolation rule (non-negotiable — this is what makes Grok usable)

**Grok animates ISOLATED elements, never a composed multi-element scene.**

Proven by test (see below): the SAME model that boiled outlines and reshuffled layout on a full scene held flat and clean on a single isolated character. The variable was isolation, not the model or the prompt.

**Production method per scene:**
1. Cut each non-Andrea element (each character, prop group, background) onto its own flat-blue plate — done programmatically (ffmpeg/mask), not by hand.
2. Grok-animate each plate separately (isolated → stays flat, holds pose, no boil).
3. **Remotion** restacks the animated plates over the still background and composites the transitions.
4. **HeyGen** Andrea (circle) sits on top.

Handing Grok a whole composed scene = boil + layout drift. Don't.

## Grok — proven settings

- **Model:** `grok_video` (Grok Video). Bake-off winner: cleanest loop-back, held pose, clean 5s @ 16:9.
  - Rejected: `grok_video_v15` (Grok 1.5) — dropped the pointing arm and slid the body; loop did not return to start.
- **Duration:** 5s, `resolution: 720p`.
- **Prompt spine:** lock the flat style explicitly (bold uniform outlines, solid flat fills, flat bg, no shading/gradient/3D/relighting), lock the camera (no zoom/pan/parallax), and — for loops — "END in the SAME pose she STARTS in." Lead with "keep this EXACT illustration unchanged, add ONLY subtle motion, do not redraw or restyle."
- **⛔ Style preservation needs the full 3-part recipe — see "✅ CORRECTED Grok recipe" at the bottom of this doc (2026-07-03).** Short version: isolated subject on a full-size flat-blue canvas + a character-DESCRIBING prompt + decline the preset (`declined_preset_id`). Missing any one → Grok repaints our doodle into a generic peach-skinned cartoon. (SuperReplaces the earlier "just feed a full 16:9 frame" note, which was an incomplete diagnosis.) QC every clip's *style* (not just motion) before compositing.
- **Hallucinated-doodle rule (tested both ways, 2026-07-03):** Grok adds small ambient doodles (sweat drops, hearts, notes) onto blank canvas around characters. Do NOT fight it with negative prompts — "do not add any new objects" made it *rewrite the scene* (new furniture, pose broken). Correct handling: accept the first-pass clip and **window-crop tight to the character** in Remotion; stray doodles outside the window vanish. Judge each clip; retry only on pose/scene drift, never on doodle-noise alone.
- **Gotcha:** generate_video first bounces with a `preset_recommendation` notice instead of rendering. Re-fire with `declined_preset_id` set to the suggested preset id to generate literally.
- **Gotcha (composite-critical):** Grok shifts the flat background blue slightly (measured `#62b3f3` → `#66b5f3`). Before compositing, re-key the clip's blue back to the exact scene blue with ffmpeg — and force `bt709` on BOTH decode and encode (`scale=in_color_matrix=bt709...out_color_matrix=bt709` + tag the output), or the re-encode shifts ALL colors and the window pops.
- **Gotcha:** the job metadata's `width/height` can lie (reported 1344×768; actual stream was 1280×720). Always `ffprobe` the downloaded file for real dimensions before doing composite geometry.
- **MCP flow:** `media_upload` → PUT bytes → `media_confirm(type:image)` → `generate_video` → `job_status(sync:true)` → download `results.rawUrl`.
- **Judging:** Claude judges every clip against the design refs — download the MP4, extract frames, compare. Never judge from the URL; never let the generator self-grade. (Same rule as the image pipeline.)

## Test log — 2026-07-03 (Higgsfield MCP, Ultra plan)

**Test 1 — flat preservation, FULL scene.** `m01_LA_s05_cash-asis.png` → Grok 1.5 img2video.
- Flat style: HELD (no 3D/realism drift). ✅
- BUT: camera pushed in, characters drifted apart / handshake broke, doorway morphed to a solid panel, outlines boiled. ❌ → full scenes are the wrong input.

**Test 2 — isolated-character bake-off.** Andrea cropped from `cast-board.png`, centered on flat-blue 1280×720. Same idempotent-idle prompt across 4 models.
- **All four held flat when isolated** — isolation fixes the drift.
- Loop-back (idempotency) ranking: **Grok Video ✅ best** (finger up, pose held) > Veo 3 Fast (held but forced 8s + rewrote prompt) > Kling 3.0 Turbo (slight end drift) > Grok 1.5 ❌ (dropped arm, slid).
- Conclusion: Grok Video is the default motion model; idle-only loops may still be cheaper/cleaner as pure Remotion element animation.

## Open next steps
1. Build the programmatic isolation script (scene PNG → per-element flat-blue plates).
2. Wire Grok Video clips into Remotion as `<OffthreadVideo>` over the still background; confirm composite holds flat.
3. HeyGen Avatar IV 1-credit test for full-body Andrea in the circle frame (defined mouth).
4. Whisper/HeyGen timestamp → timing JSON → Remotion start-frames.

### ✅ CORRECTED Grok recipe (2026-07-03, after 1B misdiagnosis) — the ACTUAL working combo
The 1B off-brand failures were NOT Grok drift and NOT the crop alone. Reproduced 1A success by matching THREE things together:
1. **Isolated plate:** subject alone on a full 1600x900 flat-blue canvas at native coords (crop subject region → `pad` back on sampled scene blue). Not a tight crop, not the full busy scene.
2. **Character-describing prompt (was the big miss):** name the character's appearance + colors explicitly ("man with short black hair, orange sweater, cream pants, yellow shoes"), name every prop as static, then the hard style lock ("flat vector doodle, bold uniform black outlines, solid flat fill colors, flat solid blue background, no shading/gradient/3D/texture/relighting"), "his exact appearance and colors stay identical", loop ("END in the SAME pose"), "locked static camera". Generic refs ("the man") let Grok invent a generic peach-skinned character.
3. **Decline the preset (`declined_preset_id`):** a descriptive prompt triggers a `preset_recommendation` bounce; re-fire with `declined_preset_id` = the suggested id to "generate literally". Short/generic prompts DON'T bounce (they render straight through, and stylize). The decline flow is what forces literal, style-preserving generation. This is the 105-uses pattern from 1A.
Verify: `anim_landlord_matched.mp4` held our exact palette but — SEE FINAL VERDICT BELOW — it still REDREW the character in Grok's polished house style (wrong proportions, detailed eyes, shading). The 3-part recipe fixes color/palette but does NOT preserve our chunky-doodle character. Superseded by the FINAL VERDICT section.

### ⛔ FINAL VERDICT (2026-07-03): Grok img2video CANNOT hold our chunky-doodle character brand — use code motion for characters
Even the "corrected recipe" (isolated plate + descriptive prompt + declined preset) only fixed the LOUD failures (peach skin, wrong colors). Side-by-side (`compare_landlord.png`) proved Grok still REDRAWS the character in its own polished vector-illustration house style: realistic proportions, detailed almond eyes + eyebrows, shaded nose, soft gradient shading — NOT our chunky flat doodle (tiny dot eyes, bracket nose, uniform marker outlines, zero shading). Jarrad's eye caught this; I had over-claimed "on-brand."
**Rule going forward:** for scenes where our specific doodle CHARACTER must stay pixel-true, do NOT use Grok — it repaints the character regardless of recipe/prompt/preset/batching (batching is irrelevant; jobs are stateless). Use Remotion CODE MOTION (push-in, parallax, sway, path draw-on, element pops) which moves our actual PNG and never redraws a line. Grok may still be OK for non-character texture (drifting clouds, water) IF QC'd, but assume character = code motion.

### 🔑 Higgsfield generate_video ACCEPTS REFERENCE IMAGES (found 2026-07-03, Jarrad's push)
`generate_video` params take a `medias` array: `[{"value": "<media_id>", "role": "style_reference" | "character_reference" | "reference"}]`
— echoed back as `reference_images`. Upload refs via media_upload → PUT → media_confirm first.
Jarrad's standing instruction: ALWAYS pass the relevant boards (style-ref, cast-board, object-board)
with every Grok generation, not just the input frame. Also: `duration` up to 15s works.
Uploaded ref media_ids this session: style-ref-1 `b345db3c…`, object-board `ff847fda…`, cast-board `c86e1fa9…`.
Being tested: whether character_reference fixes the character-repaint problem (landlord test `6fdd892a…`).

### 🧪 CONTROL EXPERIMENT (2026-07-04): Grok's style-preservation REGRESSED SERVER-SIDE — proven
Re-ran the byte-identical David job (same s03_canvas.png, same prompt, same 5s, declined preset) that
produced the on-brand 1A clip on 2026-07-03 morning. Today's output: completely reinvented scene
(realistic old man, white shirt, blue table, dollar bills, zoomed). Proof: `control_compare.png` /
`grok/control_david_rerun.mp4`. Conclusion: `grok_video` behind Higgsfield is NOT version-pinned and
its img2video style fidelity changed between 2026-07-03 AM and PM. All 1B recipe-chasing was moot.
**Rules:** (1) Never assume yesterday's Grok recipe still works — run a 1-credit control against a
known-good clip before batch-generating. (2) Provider drift, not pipeline/parallelism, is the first
suspect when identical inputs regress (Grok jobs are stateless — parallel vs sequential is irrelevant).

### ✅ NEW MOTION RECIPE OF RECORD (2026-07-04) — Seedance triple-clamp (replaces Grok entirely)
Research (3-agent sweep) + live test (`anim_landlord_seedance.mp4`) landed the working recipe:
- **Model `seedance_2_0`** (version-pinned; `seedance_2_0_mini` for cheap iteration). Grok RETIRED: unversioned
  (drifts server-side — proven by control experiment), start_image-only (reference roles silently ignored).
- **Triple clamp:** medias = [{still, role:start_image}, {SAME still, role:end_image}, {cast-board, role:image_references},
  {style-ref, role:image_references}]. Same-frame start+end forces the clip to orbit our exact pixels (and loops).
- Params: mode std, 720p, duration 4-5s, generate_audio false. Decline any preset bounce (`declined_preset_id`).
- Prompt spine: "Flat 2D vector doodle cartoon, thick uniform black outlines, solid flat fills, five-color palette on
  cornflower blue — match the reference images EXACTLY, do not restyle. SCENE/MOTION: <subtle motion, furniture still,
  ends in start pose>. Locked static camera. NEGATIVE: color drift, restyling, photorealism, 3D render, shading,
  gradients, new elements, on-screen text, watermark." (NEGATIVE line lives IN the prompt — no negative_prompt param.)
- **No seeds exist on any Higgsfield video model** — reproducibility = batch (count up to 4) + select + REUSE good clips;
  `motion_control` can transfer a proven clip's motion onto other stills. Control-test a known-good job before batches.
- Character idle/simple motion alternative: code rig (see rig-architecture report — PuppetLayer/PuppetGroup pattern,
  ±3° limb rotations self-covered by our thick outlines; guaranteed fidelity, zero credits).
