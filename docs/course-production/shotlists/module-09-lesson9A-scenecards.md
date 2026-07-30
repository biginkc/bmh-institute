# Module 09 — Lesson 9A "Seller FAQ Decoder" scene cards (2026-07-06)

Script: `lesson-9A-script-clean.txt` (~540 words ≈ 4 min). Source: master Slot 12 cues 1–13 (verbatim) + written bridge outro.
Format per `scene-card-v2.md`. Voice: Elizabeth-Friendly all beats. **Storyboard APPROVED by Jarrad 2026-07-06**
(with his redline: **NEW park-bench Andrea bookend avatar replaces cafe** — per-lesson directorial call per PLAYBOOK 8.9;
flow: still → gate → photo avatar → test clip → gate → batch).

**Topic scope:** decoding what sellers' straightforward questions really mean (trust / fair deal / simplicity) + Q1–Q5.
Overflow (cues 14–26, Q6–Q10 + close + real outro) → `lesson-9B-script.txt`, feeds a future 9B tab.

## Cast (cast-board identities — no invented characters; each appears once, so no cross-gen anchors needed)
- **Narrator = ANDREA** — NEW park-bench bookends (avatar TBD after still gate) + headset corner-circles (`e527528e…`, b02/b06).
- **GRACE** (elderly, grey bun, glasses, yellow armchair) = b02 pondering caller.
- **JIM** (balding, goggles on head, yellow polo, phone) = b04 "how does this work?".
- **DAVID** (grey beard, heavyset, orange shirt) = b05 offer-math papers.
- **CAROL** (grey bob, arms crossed) = b06 "is this a scam?" wary at her door.
- **BETH** (dark curly hair, carries a box) = b08 moving-day boxes.

## Visual spine — the DECODER chips
b02 establishes the three drivers as word-timed caption cards (verbatim questions). Question beats carry a small top-left
chip row **TRUST · FAIR · SIMPLE**; the driving chip lights word-timed (7A quad-indicator mechanic). Word-timed reveal rule:
every card/chip/label appears ONLY on its trigger word — never an empty placeholder.

| Beat | Cue | Andrea mode | Visual (Seedance-animated unless noted) | Text (trigger) | Chip |
|---|---|---|---|---|---|
| b01_intro | 1 | **hero-bench** + BMH badge | park-bench Andrea full-frame | — | — |
| b02_decoder | 2 | corner-circle (headset) | GRACE in armchair, phone to ear, pondering | "Can I trust you?" (trust) · "Am I getting a fair deal?" (fair) · "Is this going to be complicated?" (complicated) | row intro |
| b03_ten | 3 | voice-only | **Remotion code** — ten "?" tiles pop (2×5), first five light yellow | "10 QUESTIONS" (ten) | — |
| b04_q1 | 4–5 | voice-only | JIM shrugging, phone in hand, palms up | Q-card "How does this work?" (work) · CONVERSATION (conversation) → EVALUATE (evaluates) → CASH OFFER (offer) → CLOSE (closing) | SIMPLE (simplicity) |
| b05_q2 | 6–7 | voice-only | DAVID at kitchen table, papers + calculator | Q-card "How do you come up with the offer?" (offer) · SOLD PRICES (sold) · CONDITION (condition) · REPAIR COSTS (repairs) | FAIR (number) |
| b06_q3 | 8–9 | corner-circle (headset) | CAROL arms-crossed at her front door, wary, phone in hand | Q-card "Is this a scam?" (scam) · LICENSED TITLE COMPANY (title) · ATTORNEY REVIEW (attorney) · $0 UPFRONT — EVER (upfront) | TRUST (caution) |
| b07_q4 | 10–11 | voice-only | doodle balance scale, centered: worn as-is house on heavy pan vs money bag + stopwatch | Q-card "Why can't you offer more?" (more) · SPEED (Speed) · CERTAINTY (Certainty) · NO HASSLE (hassle) · NO COMMISSIONS (commissions) | FAIR (fair) |
| b08_q5 | 12–13 | voice-only | BETH carrying a moving box past stacked boxes | Q-card "How fast can you close?" (close) · A COUPLE OF WEEKS (weeks) · THEY PICK THE DATE (pick) | SIMPLE (timeline) |
| b09_outro | NEW | **hero-bench** | park-bench Andrea full-frame; bridge tease → 9B | — | — |

## Animation policy (standing, PLAYBOOK 11.6)
Every illustrated slide animated via **Seedance triple-clamp** (15s max, never looped; hold-tail per 11.7 = clip's own last
frame). Single-character scenes: "EXACTLY ONE PERSON at all times" in prompt + duplicate/clone in NEGATIVE. Multi-shot
camera energy welcome EXCEPT where chips/stickers need stable geometry (lock camera on b02/b06 — corner circle + chip pockets).
Remotion = word-timed Sticker text + transitions + b03 tiles + chip row only.

## Assets
- **Stills (Codex, 7):** bench-Andrea (avatar source, identity-anchored to `andrea_headset_v2.png`) + 6 scene plates (cast-board refs).
- **Seedance clips (6):** b02, b04, b05, b06, b07, b08 (dense-sweep QC at 0.5s cadence, whole clip).
- **HeyGen clips (4):** bench hero b01/b09 (after avatar gate) + headset corner-circle b02/b06.
- **Remotion-only:** b03 tile grid, decoder chip row, all Sticker text word-timed from `_state.json`.

## Composition notes
- b02/b06 (corner-circle): keep the ~420px bottom-right pocket clear; subject weighted left-of-center.
- b04/b05/b07/b08 (voice-only): centered compositions.
- Moving boxes = kraft cardboard (object-realism exception precedent).
- BMH badge lower-right on b01. No text baked into any still.

## Transitions
Camera-travel slides everywhere; fades ONLY into b01 / out of b09 (PLAYBOOK 10.6, gate on bookend TAGS).
Fix LessonB.tsx's transition seed bug when copying (7.13: use charCodeAt(1)+charCodeAt(2)).

## TTS notes
- b05: respell "ARV"→"A-R-V", "MAO"→"M-A-O" in spoken text only (PLAYBOOK 8.10); script/master wording unchanged.
