# Module 07 — Lesson 7A "Objection Architecture" scene cards (2026-07-05)

Script: `lesson-7A-script-clean.txt` (866 words ≈ 6 min). Source: master Slot 09 cues 1–11 + 17 + 18 (verbatim).
Format per `scene-card-v2.md`. Voice: Elizabeth-Friendly all beats. Storyboard APPROVED by Jarrad.

**Topic scope:** the FRAMEWORK — categorize an objection, match it to the right response. Scripts playbook = 7B (Slot 10).
Overflow (cues 12–16, specific objection scripts) → `lesson-7A-part2-script.txt`, feeds 7B.

## Locked cast (cast-board identities — no invented characters)
- **Rep / narrator = ANDREA** — cafe bookends (`b2cd0545…`) + headset corner-circles (`e527528e…`). She is the rep on every call.
- **JIM** (balding, goggles-on-head, yellow polo, phone) = the seller you follow: engaged (b02), still-talking (b03), silent (b06), real objection (b09), doorway (b12).
- **MARK** (black hair, arms crossed, orange tee) = the defensive variant: cold "who are you" caller (b04), reactionary "just looking" (b08).
- **DAVID** (grey beard, orange shirt, heavyset) = the frustrated venter: complaints (b07).
- Identity anchors cropped to `course-assets/scenes/module-07/_anchors/{jim,mark,david}.png`; pass as `-i` refs + "IDENTICAL face" on every gen.

## Animation policy (Jarrad, STANDING 2026-07-05)
Every illustrated slide is animated via **Higgsfield / Seedance** (triple-clamp recipe). **Remotion does ONLY text
pop-ins (Sticker) + slide-to-slide transitions.** Code-drawn slide motion is rejected (supersedes 4A "all-code").
→ Guide/PLAYBOOK still say "code motion for characters" — patch pending.

## Visual spine
Two distinct constructs so "categorize" ≠ "respond": the **4 response TYPES = a 2×2 grid** (each cell = a cast member
+ its matched one-line response); the **4-STEP framework = a left→right staircase strip**. Word-timed reveal rule (3B):
every cell / step / callout appears ONLY on its trigger word — never an empty placeholder before it.

| Beat | Cue | Andrea mode | Visual (Seedance-animated unless noted) | Text (trigger) |
|---|---|---|---|---|
| b01_intro | 1 | **hero-cafe** + BMH badge | cafe Andrea full-frame | — |
| b02_goodsign | 2 | voice-only | JIM on the phone, pushing back but leaning in / engaged | "A GOOD SIGN" (good) |
| b03_reframe | 3 | **corner-circle** (headset) | JIM + rep still connected, both still talking | "NOT A REJECTION" (rejection) |
| b04_calltype | 4 | voice-only | split scene: LEFT cold — MARK arms-crossed at a chained door ("who are you") · RIGHT warm — JIM relaxed at kitchen table; camera pans L→R | "COLD CALL" (cold) → "WARMED UP" (warmed) |
| b05_fourtypes | 5 | **corner-circle** (headset) | **Remotion code** — empty 2×2 grid frame springs in | "4 RESPONSE TYPES" (four) |
| b06_silence | 6 | voice-only | grid cell 1 fills: JIM gone quiet, calm/processing (Seedance idle) | "1 · SILENCE" (silence) + "→ GIVE SPACE, WAIT" (wait) |
| b07_complaints | 7 | voice-only | grid cell 2 fills: DAVID venting/frustrated, phone in hand | "2 · COMPLAINTS" (complaints) + "→ ACKNOWLEDGE & REDIRECT" (redirect) |
| b08_reactionary | 8 | voice-only | grid cell 3 fills: MARK arms-crossed "just looking" in a store | "3 · REACTIONARY DEFENSE" (reactionary) + "→ DON'T TAKE THE BAIT" (bait) |
| b09_realobjections | 9 | voice-only | grid cell 4 fills: JIM thoughtful, a genuine concern; grid now complete | "4 · REAL OBJECTIONS" (real) + "→ THE FRAMEWORK" (framework) |
| b10_framework | 10 | voice-only | **Remotion code** — 4-step staircase builds L→R (rep+JIM doodle at center optional Seedance) | "LISTEN" (listen) · "ACKNOWLEDGE" (acknowledge) · "ASK" (ask) · "REDIRECT" (redirect) |
| b11_sequence | 11 | **corner-circle** (headset) | **Remotion code** — the 4-word lockup pill | "LISTEN · ACKNOWLEDGE · ASK · REDIRECT" (Listen) |
| b12_doorway | 17 | voice-only | JIM steps through a doodle doorway opening into a lit conversation (Seedance push-through) | "A DOORWAY, NOT A DEAD END" (doorway) |
| b13_outro | 18 | **hero-cafe** | cafe Andrea full-frame; tease → 7B | — |

## Assets
- **Seedance clips (~8):** b02, b03, b04-cold, b04-warm, b06, b07, b08, b09, b12 (triple-clamp, 15s, dense-sweep QC).
- **HeyGen clips (5):** cafe hero b01/b13; headset corner-circle b03/b05/b11.
- **Stills (Codex, ~9):** the base plates for the Seedance clips above (each anchored to its cast identity).
- **Remotion-only:** b05 grid frame, b10 staircase, b11 lockup; all Sticker text word-timed from `_state.json`.

## Transitions
Horizontal camera-travel slides between beats (signature); fades into/out of the cafe bookends. BMH badge on b01.
