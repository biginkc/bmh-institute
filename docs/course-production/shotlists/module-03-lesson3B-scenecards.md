# Module 03 — Lesson 3B "BMH Offer Playbook B" scene cards (v1, 2026-07-04)

Script: VERBATIM from locked master `_master-transcripts.md` Slot 05-**B** (`Chapter 3A.srt`,
lines 1099–1175), 18 segments → **8 beats** (segments grouped; long beats carry word-timed sticker
reveals). Continues directly from 3A (Slot 05-A). Audio: Elizabeth-**Friendly** for Andrea beats,
loudnorm −16, word timestamps in `course-assets/heygen/lesson3B/_state.json`. Motion = **all Remotion
code, zero Seedance**. All on-screen text = code white-card `Sticker` (V1 locked white).

**Andrea:** **1A solo hero** (HeyGen avatar `e527528e584a404f9da68ee4faca1353`, the headset/hands-at-
sides Andrea from Lesson 1A — Jarrad pick, NOT cafe/office) on the two hero bookends (b01/b08).
Teaching beats are **voice-only** (Andrea off-screen — matches 3A; conserves the shared HeyGen pool).

**B6 seller monologue = its OWN speaking character.** A **talking-doodle male homeowner** with his
own HeyGen photo avatar + a **separate weary man's voice** (NOT Andrea; voice_id TBD — list voices,
pick, gate a sample). Proven path: Avatar IV invents an in-style cartoon mouth from a flat doodle
line-mouth (NEXT-SESSION line 29). Build order (Jarrad's explicit instruction): generate the homeowner
**image first** → gate → create photo avatar → gate voice sample → lip-sync → gate clip.

| Beat | VO (verbatim span) | Andrea mode | Visual | Motion | Text (trigger) |
|---|---|---|---|---|---|
| b01_intro | "Welcome back! In this lesson we're conducting a deep-dive into the BMH Group Offer Playbook…and the transformation we deliver. Let's get started." **(TRIMMED — see deviations)** | **hero-solo** (1A Andrea) | 1A Andrea full-frame + BMH badge | HeyGen; fade in | — |
| b02_offer-recap | "First, let's define exactly what we sell. Our core product is the 'As-Is Cash Home Purchase.'…without repairs, commissions, or long listing timelines." | voice-only | house + floating cash on blue | house settle + cash bob (code); title pop | "AS-IS CASH HOME PURCHASE" (Purchase) · caption "as-is · close fast · no repairs, no commissions" (as-is) |
| b03_ideal-seller | "Understanding who this is for is critical…make a traditional sale difficult." | voice-only | motivated homeowner beside a checklist board | checklist ticks draw-on, word-timed | title "IDEAL SELLER PROFILE" (Profile); items: MOTIVATED (motivated) · SELLS IN 30 DAYS (thirty) · LEGAL AUTHORITY (authority) · NOT LISTED (realtor) · SPEED OVER PRICE (convenience) · PROBLEM PROPERTY (condition) |
| b04_not-a-fit | "Who is NOT a fit? Anyone already listed with a realtor…they are not a fit for our program." | voice-only | "NOT A FIT" board; crossed-out realtor SOLD sign | red-X marks pop, word-timed | title "NOT A FIT" (NOT); ALREADY LISTED (realtor) · UNREALISTIC PRICE (unrealistic) · CAN'T LEGALLY SELL (legally) · HAZARDS > BUDGET (hazards) |
| b05_core-problems | "Now, let's look at the core problems these sellers face…the months it typically takes for a traditional, financed sale to close." | voice-only | run-down house (leaky roof, peeling paint, jungle yard) | slow push-in on disrepair; single drip (code) | "CAN'T AFFORD REPAIRS" (afford) · "NEEDS CASH NOW" (quickly) |
| b06_seller-monologue | "I can't believe how much this place has fallen apart…I just want to make the right choice, but I don't even know where to start." | **homeowner-avatar** (talking doodle; **man's voice, NOT Andrea**) | male doodle homeowner in front of the same run-down house | HeyGen lip-sync on doodle; house static bg plate; slow push-in | — (let it breathe; no sticker) |
| b07_transformation | "When we solve these problems, what is the outcome for the seller?…walks away with cash in hand and no property burden left behind." | voice-only | before→after: run-down house slides out → SOLD house + relieved homeowner with cash | **signature camera-travel slide**; weight-lifted relief | "SOLD AS-IS" (as-is) · "CASH IN HAND" (cash) · "NO BURDEN LEFT" (burden) |
| b08_outro | "You now have the full Offer Playbook…Next, we'll see how deals actually move through our system — from first contact to signed contract." | **hero-solo** (1A Andrea) | 1A Andrea full-frame | HeyGen; fade out | — (master tease, verbatim, line 1174) |

## Assets to produce
- **Stills (Codex `gpt-image-2`, 1600×900, `course-assets/scenes/module-03-lesson3B/`):**
  1. `m03_L3B_s02_offer-recap.png` — house + floating cash.
  2. `m03_L3B_s03_ideal-seller.png` — motivated homeowner + blank checklist board (ticks drawn in Remotion).
  3. `m03_L3B_s04_not-a-fit.png` — crossed-out realtor "SOLD" sign / exclusion board.
  4. `m03_L3B_s05_rundown-house.png` — disrepair house (also the b06 background plate).
  5. **`m03_L3B_s06_homeowner.png` — male doodle homeowner, front-facing, overwhelmed (clear line-mouth
     for Avatar IV). GENERATE FIRST → gate → this is the b06 avatar source.**
  6. `m03_L3B_s07_relieved-seller.png` — relieved homeowner walking away with cash; SOLD house.
  - **Exactly one person, no clone** in every single-character still (s03, s05, s06, s07) — in prompt AND NEGATIVE.
  - No ambient doodles, no skin tones, locked 5-color palette on `#62b3f3`. Hand-letter any sign text in doodle style.
- **HeyGen (`course-assets/heygen/lesson3B/`):**
  - Heroes (2): `hero_b01_intro.mp4`, `hero_b08_outro.mp4` (Andrea `e527528e…`, Friendly voice).
  - **b06 homeowner: photo avatar from `m03_L3B_s06_homeowner.png` (name REQUIRED) + weary man's voice
    → `char_b06_homeowner.mp4`.** Insufficient-credit ⇒ STOP + tell Jarrad.
- **Composition:** `remotion/src/Lesson3B.tsx` (copy `LessonB.tsx`, register in `Root.tsx`). Manifest:
  `scripts/build_manifest_3B.py`. Audio: `scripts/gen_audio_3B.py`. Avatars: `scripts/gen_avatar_clips_3B.py`.

## Master deviations pending Jarrad (record before delivery)
- **b01 intro TRIMMED** (Jarrad-approved): dropped "our process, pricing, and how to handle common
  objections" (those are 3A's material, not covered in 3B) and contracted "we are"→"we're". Full
  trimmed line: *"Welcome back! In this lesson we're conducting a deep-dive into the BMH Group Offer
  Playbook. This five-minute session will equip you with everything you need to know about our core
  service. We'll cover our offer, who it's for, the problems we solve, and the transformation we
  deliver. Let's get started."*
- Otherwise verbatim to master Slot 05-B (master already fixed the raw `.srt` "Ideal Buyer"→"Ideal
  Seller" and stripped `[sighs]`/`[frustrated]`).

## Notes
- **Voice-only teaching beats** (b02–b05, b07) match 3A — HeyGen only for the two hero bookends +
  the b06 homeowner. Keeps the shared HeyGen pool safe. Add corner-circle Andrea later if Jarrad wants.
- **b05 house = b06 background** — generate `m03_L3B_s05_rundown-house.png` so the homeowner composites
  into the same environment (continuity across the problem → monologue beats).
- **Transition-seed bug**: apply PLAYBOOK 7.13 fix on the `LessonB.tsx` copy (`charCodeAt(1)+charCodeAt(2)`;
  char 3 is always `_`). Fades only at the two hero bookends; camera-travel slides elsewhere (b07 signature).
- **1.0s inter-beat gaps** (PLAYBOOK 7.14) inserted at manifest build, not baked into beat wavs.
- Outro tease is verbatim master line 1174 → hands into Module 04 / 4A (pipeline).
