# Module 03 — Lesson 3A "BMH Offer Playbook A" scene cards (v1, 2026-07-04)

Script: VERBATIM from locked master `_master-transcripts.md` Slot 05-A (`Chapter 3 - FINAL.srt`),
18 cues (cues 18+19 merged into b18). Clean diff — no wording deviations. Audio: Elizabeth-Friendly
all beats, loudnorm −16, word timestamps in `course-assets/heygen/lesson3A/_state.json`. 7:26 VO,
7:43 with 1.0s inter-beat gaps. Motion = **all Remotion code, zero Seedance** (Jarrad's staged
actions are code two-state/prop moves). Two Andrea roles: **office Andrea** (HeyGen hero bookends,
avatar `63396931…`, Jarrad override of the cafe default); **headset Andrea** drawn as the in-scene
doodle rep (b03/b04/b17). All on-screen text = code white-card `Sticker` (V1 locked white).

| Beat | VO (verbatim span) | Andrea mode | Visual | Motion | Text (trigger) |
|---|---|---|---|---|---|
| b01_intro | "Now that you know who our sellers are…in about 30 seconds." | **hero-office** | office Andrea full-frame + BMH badge | HeyGen; fade in | — |
| b02_offer-core | "We buy houses for cash, as-is…let me walk through them." | voice-only | family in driveway + house | 6 chips cascade | CASH·AS-IS·NO REPAIRS·NO AGENTS·NO COMMISSIONS·NO WAITING (word-timed) |
| b03_cash | "When I say we buy with cash…financing didn't come through." | voice-only | headset-rep + seller handshake, cash between | push-in | CERTAINTY (certainty) |
| b04_asis | "As-is. The seller doesn't need to fix a single thing…exactly as it sits." | voice-only | rep+wand; disrepair→restored house | **wand crossfade + sparkle** (trigger "handle") | SOLD AS-IS — ANY CONDITION (fix) |
| b05_commissions | "In a traditional sale…the number they walk away with." | voice-only | devil-horned "REAL ESTATE AGENT" taking cash | push-in | NO COMMISSIONS (commissions) |
| b06_speed | "A traditional sale takes 60 to 90 days…speed changes everything." | voice-only | foot kicking the clock | two labels | 60–90 DAYS (90) / 1–2 WEEKS (two) |
| b07_step1 | "When you're explaining our process…relationship starts." | voice-only | 4-step roadmap, stop 1 lit | ring glow | 1 · WE TALK (talk) |
| b08_step2 | "Second, we look at the property…repairs would cost." | voice-only | roadmap stop 2 lit | ring glow | 2 · WE LOOK (look) |
| b09_step3 | "Third, we make an offer…doesn't want to do business." | voice-only | roadmap stop 3 lit | ring glow | 3 · WE OFFER (offer) |
| b10_step4 | "Fourth, we close…signs the paperwork, and gets paid." | voice-only | roadmap stop 4 lit | ring glow | 4 · WE CLOSE (close) |
| b11_foursteps | "Four steps. That's it…Because you do." | voice-only | roadmap, all 4 lit | rings cascade | FOUR STEPS (Four) |
| b12_honest | "Now, I want to be honest…holding and reselling the property." | voice-only | **Seedance walk-and-talk**: headset-rep + seller walking, scrolling neighborhood, multi-shot | 15s clip + hold on clip's last frame | BELOW RETAIL — WE TAKE ON THE RISK (below) |
| b13_whychoose | "So why do sellers choose us?…sign and walk away." | voice-only | 4 pill cards on blue | pills arc, word-timed | SPEED·SIMPLICITY·CERTAINTY·CONVENIENCE |
| b14_tradeoff | "For a seller who inherited a house 500 miles away…All of that is fine." | voice-only | relieved seller, weight lifted | push-in | SPEED + PEACE OF MIND (peace) |
| b15_dealmath | "You should also understand the basics…how we get to a number." | voice-only | whiteboard; formula draws on | 4 lines pop | ARV − Repairs − Margin = YOUR OFFER (value/costs/margin/offer) |
| b16_example | "Here's an example…isn't as far off as it sounds." | voice-only | whiteboard; numbers | 4 lines pop | $200K − $50K − costs ≈ $100–110K (200/50/costs/100) |
| b17_answer | "Last thing. When a seller asks 'how does this work?'…memorized or robotic." | voice-only | headset-rep on phone | caption strip | "…for cash. No repairs, no commissions — close on your timeline." (cash) |
| b18_outro | "The best way to truly internalize a script…lock the full Offer Playbook in." | **hero-office** | office Andrea full-frame | HeyGen; fade out | — (master tease, verbatim) |

## Assets
- Stills (12): `course-assets/scenes/module-03/m03_L3A_*.png` — family-driveway, handshake, rep-wand,
  house-disrepair, house-restored, devil-agent, clock-kick, steps-board, injury, peace, whiteboard, phone.
- Heroes (2): `course-assets/heygen/lesson3A/hero_b01_intro.mp4`, `hero_b18_outro.mp4` (office avatar).
- Composition: `remotion/src/Lesson3A.tsx` (registered in `Root.tsx`). Manifest builder:
  `scripts/build_manifest_3A.py`. Audio: `scripts/gen_audio_3A.py`. Avatars: `scripts/gen_avatar_3A.py`.

## Notes / lessons (2026-07-04)
- **Transition-seed bug fixed on the copy** (PLAYBOOK 7.13): `charCodeAt(1)+charCodeAt(2)` (char 3 is
  always `_`). Fades only at hero bookends.
- **house-disrepair re-rolled once** — first Codex pass came back as a corrupted dithered image;
  re-roll with "clean flat sticker-doodle, NO dithering/texture/hatching" fixed it one-shot.
- **Sticker bg is hardcoded white** (V1 lock) — the `bg` prop is ignored for background; no colored
  pills possible without editing Sticker. Emphasis via position (bottom line), not color.
- **Wand two-plate split** (b04): rep clipped to left of x=620, houses clipped to right of x=620, so
  neither plate's flat-blue field covers the other; house2 opacity-crossfades over house1 at the flick.
- **devil-agent name tag rendered clean** ("REAL ESTATE AGENT") — single short-label exception held.

## Rev1 (Jarrad watch-through of v1 artifacts, 2026-07-04→05) — final cut = `LESSON-3A-rev1-FULL.mp4`
- b02 mom re-rolled: blonde homeowner (v1 mom read as the Andrea avatar — black curly).
- b05 devil re-rolled: cash clutched in the agent's fist (v1 hand was empty → read as reaching).
- b06 clock re-rolled: real face (hands, ticks, 12/3/6/9). v1's "no numbers" prompt made a blank disc.
- b04 houses re-rolled: bigger, more elaborate two-story w/ porch, center-right (v1 too small/right-jammed, big gap to rep). CLIP=560 in WandBeat closes the gap.
- b12 re-concept: the "injury/burden" figure read as "someone got hurt" (Jarrad: "I don't get it") → **walk-and-talk Seedance clip** per his direction (rep+seller walking, scrolling bg, multi-shot).
- Whiteboard math (b15/b16): v1 used white-card Stickers → floated OUTSIDE the board with drop shadows. Fixed to plain INK text (`BoardBeat`, loadFont Baloo2, `#111`) positioned inside the board, no card/shadow.
- Roadmap active step (b07–b11): v1 white glow ring "wasn't reading" → recolor the stop yellow→orange (`ActiveStop`, numeral redrawn), ring removed.

### Seedance two-character walk-and-talk HELD on-brand (2026-07-05) — new datapoint
b12 is the first two-doodle-character Seedance walk in the course. Recipe that worked: **start_image +
cast-board + style-ref as image_references, NON-clamped** (no end_image — the same-frame clamp would
force a loop-back and kill the scrolling background Jarrad wanted), hard style-lock prompt naming both
characters' exact look, `count:2` and select. Dense 0.5s sweep of both candidates = zero repaint, zero
clones, zero third-person — the documented two-character failure did NOT occur here. **Non-clamped clips
don't return to the start pose**, so the hold-tail must be the CLIP'S OWN LAST FRAME (extract via
`ffmpeg -sseof`), NOT the start still — otherwise the 5s tail pose-jumps + blue-jumps (caught in QC).
