# Module 06 — Lesson 6A "Discovery" scene cards (v1, 2026-07-05)

Script: `lesson-6A-script-clean.txt` (~824 words ≈ ~6 min). Format per `scene-card-v2.md`.
Source: locked master `_master-transcripts.md` Slot 08 (`Chapter 6 - FINAL.srt`), cues 1–8 (Discovery half).
Overflow (cues 9–16, the Handoff) → `lesson-6B-script.txt` for a future 6B tab.
Voice: Elizabeth-Friendly all beats, speed 1.0. Cafe-Andrea bookends (`b2cd0545…`). BMH badge on b01.
Storyboard APPROVED by Jarrad 2026-07-05 (redlines folded in: b02 office, b04 masked seller, b05 pyramid,
b06 table-of-notices, b08 five arms-crossed). Seedance on b02/b03/b07; all other motion is Remotion code.
All on-screen text is code-rendered (`Sticker.tsx`) — never baked into stills.

| Beat | VO (verbatim span) | Andrea mode | Visual | Motion | Text (trigger word) |
|---|---|---|---|---|---|
| b01_intro | "In the last module…this is where the real skill shows up." | **hero-cafe** (cafe avatar) | cafe Andrea full-frame | HeyGen lip-sync + **BMH badge** | — |
| b02_qualify | "Let me draw a clear line between qualification and discovery…covered a lot of that in the fact find." | voice-only | **bustling office**: people at desks on phone headsets, one or two walking short in-frame paths | 🎥 **Seedance**, LOCKED camera (start=end), **seamless code-loop** to cover full VO (~25s) | "QUALIFICATION" (qualification) |
| b03_discovery | "Discovery is a completely different question…you're just collecting data." | corner-circle (headset `e527528e…`) | **iceberg** — small white tip above a thin waterline, large cream mass below on the same blue (NO magnifier) | 🎥 **Seedance**, gentle push-in / subtle shimmer; furniture never grows; ends on start pose | "DISCOVERY" (discovery) |
| b04_motivation | "So you've already established rapport…messier and more human than that." | voice-only | **still: seller holding up a smiling mask** on a stick, worried real eyes above it | slow code push-in (Jarrad: keep it a still, no mask-lift) | "THE POLISHED ANSWER" (polished) |
| b05_dig | "Your job is to go underneath…feel safe enough to do it." | voice-only | **shovel digging down through stacked soil layers to a buried TREASURE chest** (the real reason) at the bottom | code: shovel digs, dotted path + layers peel, treasure revealed on trigger | "THE REAL REASON" (underneath) |
| b06_financial | "The next area to explore is financial burden…changes the entire picture." | voice-only | **table piled with notices** reading INVOICE · OVERDUE · TAX BILL · PAST DUE · FINAL NOTICE · NOTICE (baked words — approved exception) + orange stamps | code: notices drop onto the table word-timed as she lists mortgage/taxes/liens | "FINANCIAL BURDEN" (burden) |
| b07_whatif | "There's one more question…That's someone who needs to move." | voice-only | **fork in the road** — LEFT bright (sun, tidy house), RIGHT gloomy grey (storm cloud, rain, drab house); NO arrow | 🎥 **Seedance**, camera travels the fork (multi-shot welcome); ends on start pose | "WHAT IF?" (what if) |
| b08_decision | "And before you hand this lead off…putting an offer together." | corner-circle (headset `e527528e…`) | **~five distinct people, arms crossed, facing the viewer** (decision-makers — none may resemble host Andrea) | code push-in | "WHO SIGNS?" (call) |
| b09_outro | "So that's discovery…Because bad handoffs kill deals that should have closed. I'll see you there." | **hero-cafe** (cafe avatar) | cafe Andrea full-frame | HeyGen lip-sync, fade out | — |

## Sticker labels (locked wording)
b02 QUALIFICATION · b03 DISCOVERY · b04 THE POLISHED ANSWER · b05 THE REAL REASON ·
b06 FINANCIAL BURDEN · b07 WHAT IF? · b08 WHO SIGNS?
(b04/b05 pair the mask = polished answer with the treasure = the real reason.)

## Still files (course-assets/scenes/module-06/) — 7 Codex stills + 2 HeyGen bookends
m06_L6A_office.png · m06_L6A_iceberg.png · m06_L6A_mask.png · m06_L6A_dig.png ·
m06_L6A_notices.png · m06_L6A_fork.png · m06_L6A_deciders.png
(office/iceberg/fork are the Seedance start-images; mask/dig/notices/deciders are code-motion stills.)
Palette exceptions on record: b06 notices carry baked document words; b07 fork uses grey for the bleak side.

## Seedance beats (3): triple-clamp recipe of record (ARCHITECTURE.md)
- **b02 office** — MULTI-PERSON (do NOT use the "exactly one person" clamp). NEGATIVE adds:
  clones/duplicate faces, characters merging/morphing, a walker leaving frame then reappearing on a
  wrong path, extra limbs. Prompt: several distinct people at desks on phone headsets, one or two
  walking SHORT paths that stay fully in frame, continuous ambient bustle, everyone fully in frame at
  all times, ends EXACTLY on the opening pose for a seamless loop. LOCKED static wide camera.
- **b03 iceberg** — single object scene; gentle water shimmer + slow push-in (NO magnifier); the mass
  never grows; ends on start pose.
- **b07 fork** — no characters (road + two paths + small distant house icons); "subtle cinematic camera
  energy" traveling the fork is WELCOME; nothing new appears; ends on start pose.

## Motion = CODE (Remotion) on b04/b05/b06/b08
Push-ins, shovel-dig + treasure reveal (b05), word-timed notice drops (b06 table), all Sticker pops. No Seedance.

## Transitions
Camera-travel slides between voice-only beats; fades into/out of the two cafe-Andrea hero bookends.
1.0s silent gap between every beat (inserted at manifest build).

## Master deviations to record (flag to Jarrad, log in PLAYBOOK)
1. **b01 intro** — trimmed the cue-1 sentence that previews the handoff ("And then we're going to talk
   about…the handoff") since 6A is the discovery half only.
2. **b07 opener** — reworded cue-7's "As we discussed previously, I'm bringing this up again" (a
   prior-module callback that's stranded in a standalone lesson) → "There's one more question…"
3. **b09 outro** — NEW; the master has no break at the discovery→handoff boundary (cue 8 runs straight
   into cue 9). Stitched from the master's own phrases and bridges into 6B; the Chapter 7 "Objection
   Architecture" tease is preserved for the END of 6B (the true module boundary).
