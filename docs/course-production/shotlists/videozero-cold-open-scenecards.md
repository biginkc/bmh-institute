# VIDEO ZERO — cinematic course cold-open ("Why BMH exists")
_Approved plan 2026-07-11 (Jarrad). Storyboard-first: NOTHING animates until Jarrad approves the frames + script at the image gate._

## Creative charter
- **What it is:** the course's opening film. The viewer FEELS why BMH exists before any teaching. Cinematic, atmospheric, sparse — *less explanatory*.
- **Style:** the flat doodle-sticker brand style, **directed cinematically**. Same palette, same outlines, same minimalism (rules 1d/1d-ii/1f/1g all apply). "Cinematic" lives in the CAMERA (parallax, push-ins, tracking, holds) and the PACING — not in a style change.
- **Audio:** Andrea's voice as background VOICEOVER (course TTS voice, speed 1.0) — no lip-sync anywhere. Statistics are SPOKEN only, never on-screen text. Music deferred to a later pass (visuals first).
- **Andrea outdoors look:** anchor to the 1A standing avatar (dark curly hair, yellow sweater, cream pants, orange shoes) — **no headset** outside the office (she's commuting; the headset appears in lessons). Skin PURE WHITE (rule 1g), like all characters.

## VO script (draft — Jarrad finalizes at the gate)
1. "People think we buy houses."
2. "We don't. Not really."
3. "Last year, foreclosure came for more than three hundred thousand families. Most of them never listed — never got the sign in the yard, the open house, the offers."
4. "They just needed someone to show up."
5. (on the turn) **"Somewhere out there, a family's running out of options. Today, we get to be one. Let's go."**

Stats basis (spoken, not shown): ATTOM 2025 year-end — 367,460 U.S. properties with foreclosure filings, +14% YoY; ~40% of investors bought their last property off-market / distressed sellers overwhelmingly never reach the MLS.

## Shot sequence (14 shots, target 60–75s)
_`Playback order` added 2026-07-13 (COLD-OPEN FIXES round) — for shots 1–5 the final edit order differs from the asset numbering below; see that section for why. All other shots edit in numeric order._

| # (asset) | Shot | Camera | VO | Playback order |
|---|------|--------|----|----|
| 1 | Andrea's house, extreme wide, early morning — house small in a huge flat sky; **now shows her mid-exit through the front doorway, hand on the door** (COLD-OPEN FIX, was a bare house with no Andrea) | slow push-in, her exit motion completes within the clip | (beat of quiet) → line 1 | **1st** |
| 2 | ~~Detail inserts: keys in hand / front-door handle~~ **REPURPOSED: close-up of keys turning in the car's ignition** (COLD-OPEN FIX — old disconnected keys-in-hand insert dropped; Jarrad: "should she be inserting them into the ignition of the car?") | quick static close-up, key-turn motion | *(see playback order — no longer plays here)* | **4th** (moved) |
| 3 | **Match cut A:** her front door closes | static, centered | line 1 tail (moved here from old shot 2 — see note below) | **2nd** |
| 4 | Andrea walks to the car, gets in, pulls away | side view | line 2 | **3rd** |
| 5 | **Side-scroll tracking** — car in profile, neighborhood slides by in 3 parallax layers | lateral track | line 2 → 3 start | **5th** |
| 6 | **Windshield POV** — dashboard + hands on wheel, homes drifting past beyond glass | interior POV, subtle drift | line 3 | 6th |
| 7 | **Top-down bird's-eye** — rooftop grid, one car threading through | overhead, slow travel | line 3 (foreclosure number lands here) | 7th |
| 8 | **Reality beat** — a home in quiet distress: taped notice on the door, overgrown yard. No people. | slow push-in, LONG hold | line 3 tail → silence | 8th |
| 9 | **Rearview mirror** — the distressed house recedes in her mirror | mirror inset | silence → line 4 start | 9th |
| 10 | **Low-angle BMH reveal** — building rises as the car turns into the lot; BMH signage legible | low angle, rising | line 4 | 10th |
| 11 | Parks; out of the car; **over-the-shoulder follow** toward the entrance | trailing follow | quiet | 11th |
| 12 | **Match cut B:** the BMH door ahead (answers shot 3) | centered, echo of #3 | — | 12th |
| 13 | **THE TURN** — she reaches the BMH door, pushes it partially open, pauses and turns back over her shoulder; camera **pushes in / zooms to her face** as she delivers the line (motion instruction for the animation pass — single frame, no separate close-up still) | medium shot → animated punch-in | line 5 | 13th |
| 14 | Title beat ("BMH" mark) → hard cut to Lesson 1A (no extra "walks in" frame — cuts straight from the zoomed face) | — | — | 14th |

## Storyboard frames to generate (Codex gpt-image-2, 1600×900, style refs + Andrea anchor attached)
Assets land in `course-assets/scenes/module-v0/`, prefix `mV0_LV0_`:
1. `s01_house-wide.png` — extreme wide, Andrea's modest doodle house, small in frame, huge flat sky, morning warmth in the windows (bg canonical blue).
2. `s02_keys-detail.png` — close-up: white-skinned hand holding simple doodle keys.
3. `s03_home-door.png` — front door, centered, closed (match-cut A frame).
4. `s04_walk-to-car.png` — Andrea (anchored look, no headset) walking toward a simple doodle car in the driveway, side view.
5. `s05_sidescroll.png` — car in profile mid-street; composition shows 3 depth bands (foreground mailbox/tree line, houses, skyline) for parallax.
6. `s06_windshield-pov.png` — interior POV: dashboard bottom, Andrea's white hands on wheel, windshield framing houses ahead.
7. `s07_topdown-grid.png` — bird's-eye rooftop grid of a neighborhood, one car on the road threading through; map-style flat (b04-map precedent).
8. `s08_notice-door.png` — distressed home's door with a taped NOTICE (baked text: `NOTICE` only — rule 1f, garble-check), overgrown yard hints, no people.
9. `s09_rearview.png` — rearview mirror inset composition: mirror in upper frame showing the small distressed house receding; road ahead beyond.
10. `s10_bmh-lowangle.png` — low-angle BMH building rising, `BMH` signage baked and legible, car turning into lot.
11. `s11_follow-entrance.png` — behind-Andrea over-the-shoulder: she walks toward the BMH entrance across the lot.
12. `s12_bmh-door.png` — the BMH entrance door, centered (match-cut B; echoes s03).
13. `s13_door-ajar-turn.png` — Andrea at the door, one door pushed partially open, hand still on it, body/head turned back toward camera mid-pause. The money frame — the animation pass zooms into her face on this frame during line 5 (Jarrad, 2026-07-12: single frame, no separate close-up still; archived close-up at `_v3-restaged-superseded/` can serve as the zoom-target reference).
(Shot 14's title beat is a Remotion text card — no generated art; no blank shapes.)

## Rules in force
1d minimalism (every object earns its place) · 1d-ii NO blank shapes · 1e no code-drawn scene content · 1f static text baked (only `NOTICE` and `BMH` signage in this piece) · **1g skin pure white — pixel-verify, never eyeball (`scripts/whiten_character_skin.py`)** · canonical blue bg #62b3f3 · character consistency via anchor (Andrea = 1A standing look, no headset outdoors).

## Gates
1. **Storyboard/image gate (NEXT):** all 13 frames pre-QC'd (style, palette, white skin, anchors, no blank shapes, `NOTICE`/`BMH` garble-check) → watch page + Drive `08 — Video Zero Storyboard — PENDING JARRAD APPROVAL` → HARD STOP for Jarrad.
2. Animation/assembly gate: only after frame+script approval. Remotion camera over layered art (parallax/push-ins/tracking); Seedance ONLY if a specific character beat needs it and holds the style; VO timing via whisper; encode 1600×900 yuv420p tv BT.709; full QC (incl. per-frame skin scan) before delivery.
3. Music pass: revisited after visuals are approved.


---
## REDLINE ROUND 1 (Jarrad, 2026-07-11 — supersedes conflicting guidance above)
1. **NO Remotion camera moves.** All motion comes from the image + animation engine (Seedance-class img2video over the approved stills; per-frame white-skin pipeline available if drift). Assembly = simple concat + VO (no code camera, no parallax rigs).
2. **BMH building = the module-1A canon** `course-assets/scenes/module-01/m01_LA_s02_bmh-building.png` (yellow building, orange accents, GREEN B|M|H logo sign, planters, tree, sidewalk). Attach as anchor to every BMH shot. Do NOT invent a new building.
3. **Richness bar = 1A canon** (e.g. `module-01/andrea_car_v2.png`): populated neighborhoods (rows of houses, driveways, sidewalks, lawns), clouds in the sky, detailed interiors. The v1 frames were too sparse ("out-of-shape boxes"). Minimalism rule 1d still bans purposeless clutter, but V0 scenes must feel like real places, not isolated objects on blue.
4. **GREEN foliage** — trees, bushes, lawns are green (logo green family), NOT black silhouettes and not all-yellow. Black is reserved for outlines/hair/tires/wheel.
5. **Neighborhood, not isolation** — s01 shows HER house among neighbors (a street, not one floating house).
6. **s07 top-down grid full rework** — detailed rooftops (ridgelines, driveways, yards, trees, lane-lined streets), many homes, not blank orange rectangles.
7. Interior driving shots anchor to `andrea_car_v2.png` richness (mirror, dash detail, clouds, houses through glass).

---
## RESTAGE (Jarrad, 2026-07-12)
1. **s11 continuity fix** — Andrea was staged too far from her parked car (read as a different vehicle); tightened to ~1-2 body-widths so it clearly reads as "just stepped out."
2. **s12/s13 environment mismatch fixed** — s12 had flanking trees + clouds, s13 didn't. Resolved by restaging s13 to match s12's environment exactly (see below).
3. **Ending re-blocked** — was a single "she stops and turns" wide (s13). Now: she reaches the door, pushes it partially open, pauses and turns back (s13, medium, door ajar) → the camera zooms/pushes in to her face as she delivers the line (MOTION instruction for animation, not a second still — Jarrad dropped the separate close-up frame 2026-07-12) → straight cut to title (no added "walks in" frame). Old s13 and the dropped close-up archived at `_v3-restaged-superseded/`.

---
## COLD-OPEN FIXES (Jarrad, 2026-07-13 — after reviewing the animated 13-clip cut)

Jarrad flagged two shots in the animated opening. Both are fixed at the still + animation level; asset numbering (`s01`...`s13`) is unchanged per standing convention — only the **edit/playback order** moves, captured in the Shot sequence table above.

1. **s01 (house-wide) — Andrea added, mid-exit.** Jarrad: "don't we need to see her coming out of the house for number one?" The original still was a bare house with no character in it. Regenerated with Andrea (anchored to `_anchors/andrea-standing.png`) stepping through the open front doorway, one hand still on the door edge, one foot on the porch step — same canon 3-window house, same neighborhood/street/sky, nothing else redesigned. Animated with a slow push-in where she completes the exit (steps down, door swings closed, a couple of steps toward the street) within the same ~5s clip. Old still archived at `_v4-coldopen-fixes-superseded/mV0_LV0_s01_house-wide_NO-ANDREA-EXIT.png`, old clip at `_animated/_v4-coldopen-fixes-superseded/mV0_LV0_s01_NO-ANDREA-EXIT.mp4`.
2. **s02 (keys-detail) — full repurpose to ignition insert.** Jarrad: "I don't understand what the purpose of this clip is. Should she be inserting them into the ignition of the car?" The old content (a disconnected keys-in-hand insert with no car in frame) is dropped entirely. New content: a tight close-up inside the continuity orange sedan — white-skinned hand gripping a key already seated in the ignition barrel, steering wheel and dashboard visible, matching the interior richness/style already established in `mV0_LV0_s06_windshield-pov.png` and the `andrea_car_v2.png` reference. Animated as a quick ~4s insert (Seedance's 4s floor, same constraint noted in the original animation pass for s02/s03/s12) with a quarter-turn key-start motion. Old still archived at `_v4-coldopen-fixes-superseded/mV0_LV0_s02_keys-detail_ORIGINAL-DISCONNECTED-INSERT.png`, old clip at `_animated/_v4-coldopen-fixes-superseded/mV0_LV0_s02_ORIGINAL-KEYS-INSERT.mp4`.
3. **Playback order changes, asset filenames don't.** s02's new ignition content narratively belongs *after* the walk-to-car beat, not in original position 2. Final edit order for this stretch: **house w/ exit (s01) → door closes (s03, match cut A) → walk to car (s04) → ignition/key-turn (s02, repurposed) → side-scroll drive (s05)**. See the `Playback order` column added to the Shot sequence table above.
4. **VO flag for assembly (not resolved here):** VO line 1's tail was originally timed to land over the old shot-2 keys insert. With shot 2 moved to play 4th (after the walk-to-car beat) and shot 3 (door-close match cut) now playing 2nd, **line 1's tail needs to be re-timed to land over the door-close match cut (s03) instead.** This is a VO/assembly-step concern, not something resolved in this fix — flagging it here so whoever does the audio timing pass doesn't miss it.
