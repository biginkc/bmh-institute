# Module 06 — Lesson 6B "The Handoff" scene cards (v1.1, 2026-07-08 — label-queue + transition rule applied)

Script: `lesson-6B-script-clean.txt` (~600 words ≈ ~5 min). Format per `scene-card-v2.md`.
Source: locked master `_master-transcripts.md` Slot 08 (`Chapter 6 - FINAL.srt`), cues 9–16 (Handoff half).
Sibling: cues 1–8 (Discovery) already delivered as 6A. Zero master deviations — this half is 100% verbatim.
Voice: Elizabeth-Friendly all beats, speed 1.0. BMH badge on b01.

**Bookend avatar (Jarrad override, this session): 1A solo-Andrea portrait avatar (`e527528e584a404f9da68ee4faca1353`)**
— same avatar used in 3B/5A "Andrea alone" bookends, replacing 6A's cafe-Andrea default for this lesson.
**Color-match requirement:** the backing color behind Andrea's cropped portrait strip MUST be sampled and
matched exactly to the canonical background blue (`#62b3f3`) used on every other still in the frame — do
NOT reuse 3B's/5A's inset or backing values as-is. Prefer requesting
`"background":{"type":"color","value":"#62b3f3"}` on the `/v3/videos` call so Andrea renders directly on
canonical blue; if a residual native-panel fringe remains at the crop edge, color-grade the backing plate
to `#62b3f3` exactly. QC via pixel probe on the delivered clip (far background + Andrea-backing region),
never by eye — this is the fix for the "lighter gray behind Andrea vs. darker gray elsewhere" mismatch.

Storyboard APPROVED by Jarrad (2026-07-07).
Seedance animates the illustrated mid-beats per standing policy 11.6 (static-still fallback if Higgsfield
MCP is unavailable — flag, don't block). All other motion is Remotion code. All on-screen text is
code-rendered (`Sticker.tsx`) — never baked into stills.

**Label positioning rule (Jarrad, 2026-07-08, STANDING across all lessons):** every Remotion teaching
label defaults to **bottom-center**, and only **one label is visible on screen at a time** — the current
label animates OUT before the next one animates IN (a queue, never a stack). A label only goes anywhere
else (top, corner, beside a prop) when the beat has a specific positioning purpose (e.g. text that's
meant to read as sitting ON a diegetic prop, like a calendar or clipboard, rather than as a floating
teaching callout) — and that exception must be called out explicitly on the beat, not assumed.

**REVISED 2026-07-10 (Jarrad direction, pre-production):** (1) rule 1d-ii — NO blank shapes anywhere; every card/field/panel carries baked text or doesn't exist; (2) b02 redesigned — the CRM form IS the scene, completed via a word-timed progressive-fill baked-still sequence (no Priya-at-desk framing, no Remotion field text); (3) b05 thought-bubble removed; (4) b06 check-offs are baked progressive stills, not code marks; (5) outro decision RESOLVED — cue 16 master-verbatim close, NO added 7A tease (7A's shipped opener already speaks the tease line; adding it to 6B would duplicate it back-to-back). The NEXT-LESSON TEASE note in lesson-6B-script.txt is void.

**Transition rule (Jarrad, 2026-07-08, STANDING across all lessons):** the Lesson 1A camera-travel slide
is used **only** where the cut reads as the camera moving to a different physical location on the scene
plane (e.g. arriving at a new desk/room, leaving one scene and entering another). Where two adjacent beats
are really just swapping graphic/diagram content in the same "no location" space (a chart, a checklist, an
icon panel), use a straight code cut/reveal instead — a slide there would falsely imply a spatial move that
isn't happening. Fade is reserved only for the b01/b08 bookends, never mid-lesson.

| Beat | VO (verbatim span) | Andrea mode | Visual | Motion | Bottom-center label (trigger word) |
|---|---|---|---|---|---|
| b01_intro | "Alright, let's talk about the handoff…Bad handoffs kill deals that should have closed." | **hero-solo** (1A solo-Andrea, color-matched blue) | Andrea alone, full-frame | HeyGen lip-sync + **BMH badge** | "STAGE 4" (Stage 4) |
| b02_crmnotes | "Here's what the process looks like…that's on you." | voice-only | **full-frame Sandra CRM form being completed** (Jarrad redirection 2026-07-10 — Priya typing is OUT; the form IS the scene). One clean doodle CRM panel, six fields with BAKED text filling in with Diane's real details: SELLER: DIANE R. · PROPERTY: DUPLEX — DAYTON · MOTIVATION: TENANT BURNOUT · TIMELINE: BEFORE END OF SUMMER · FINANCIALS: 2 MO BEHIND ON TAXES · NOTES: INHERITED — BE SENSITIVE. No blank fields ever visible as "empty rectangles" — an unfilled field shows only its baked field LABEL until its value appears. | **ANIMATED — progressive-fill baked-still sequence**: 6 stills, identical layout, each adding the next completed field; word-timed straight cuts as Andrea lists what complete notes mean. Zero Remotion text (rule 1e/1f); the fill animation is the generated art itself. Text garble judged per still at the image gate (Seedance NOT used — repaints text). | "COMPLETE YOUR NOTES" (CRM notes) |
| b03_briefam | "Second, brief the acquisition manager…where to be careful." | corner-circle (headset `e527528e…`) | **acquisition manager on a headset**, receiving the briefing; summary card beside them with BAKED static text: "DIANE · DAYTON · DUPLEX 11 YRS · BEHIND ON TAXES" (matches the b02 form — same seller, one story) | 🎥 **Seedance**, subtle idle/listening motion, LOCKED camera; card text is baked in the still from frame one (no populate animation — Seedance would repaint it) | "BRIEF THE AM" (brief the acquisition manager) — the DIANE card is **diegetic baked text** (positioning exception, not the bottom-center queue) |
| b04_transfer | "Third, either warm-transfer the seller…Don't leave it vague." | voice-only | **2-panel split**: left = phone-transfer icon (call arcing from rep to AM), right = calendar with "TOMORROW · 2:00 PM" circled — calendar text BAKED | straight cut/reveal from left panel to right panel on "or set a specific appointment" (icon-panel swap, not a location move — no slide) | none — "TOMORROW · 2:00 PM" is **diegetic baked text**; no separate bottom-center label needed |
| b05_frame | "And fourth, frame the handoff for the seller…bounced around randomly between strangers." | voice-only | **seller on the phone, reassured** — calm posture only. NO thought bubble (rule 1b), no extra props. | code push-in on the still | "NO PRESSURE, NO OBLIGATION" (no pressure) |
| b06_checklist | "Before you move any lead to Stage 4…genuinely good." | voice-only | **clipboard/checklist board**, 10 rows with BAKED row text: STORY · MOTIVATION · TIMELINE · CONDITION · PRICE · DECISION-MAKER · FINANCIALS/LIENS · CONTACT TIME · HOT BUTTONS · AM BRIEFED | **ANIMATED — progressive-tick baked-still sequence** (same mechanic as b02): stills identical except checkmarks accumulate; word-timed straight cuts as she lists each item. No code-drawn checkmarks (rule 1e). | "10-POINT CHECKLIST" (make sure) — row text is **diegetic baked text**; the bottom-center label names the beat once |
| b07_killers | "Let me tell you what kills handoffs…you're going to be in great shape." | voice-only | **3-panel X-list**, all three panels complete in one still with X-marks and short baked captions: INCOMPLETE INFO · NO MOTIVATION CONTEXT · NO WARM INTRO | single still, code push-in; the bottom-center queue names each killer word-timed as she reaches it | "INCOMPLETE INFO" (Incomplete information) → "NO MOTIVATION CONTEXT" (no context) → "NO WARM INTRO" (no warm introduction) |
| b08_outro | "That's discovery and handoff…Show us what you've got." (verbatim cue 16 — closing line) | **hero-solo** (1A solo-Andrea, color-matched blue) | Andrea alone, full-frame | HeyGen lip-sync, fade out | — |

**Label queue (Jarrad rule, 2026-07-08):** b01→b02→b03→b05→b06→b07 labels are a single bottom-center
queue — each prior label animates OUT before the next animates IN, only one on screen at any moment.
b04 contributes NO bottom-center label (its text is diegetic, on the calendar prop) — the queue simply
skips it and the next label (b05) is what animates in when its beat starts.

## Sticker labels (proposed wording — confirm with Jarrad at storyboard gate)
b01 STAGE 4 · b02 COMPLETE YOUR NOTES · b03 BRIEF THE AM ·
b05 NO PRESSURE, NO OBLIGATION · b06 10-POINT CHECKLIST · b07 3 DEAL-KILLERS
(b04 has no bottom-center label — see diegetic-text note above.)

## Still files (course-assets/scenes/module-06-lesson6B/) — 5 new Codex stills, 0 new bookend stills
m06_L6B_crmnotes.png (b02) · m06_L6B_briefam.png (b03) · m06_L6B_transfer.png (b04) ·
m06_L6B_checklist.png (b06) · m06_L6B_killers.png (b07)
(b01/b08 reuse the existing 1A solo-Andrea bookend still — no new still, but a NEW HeyGen talking
clip is required since this lesson's VO differs from 3B/5A's.)

## Seedance candidates (confirm scope at storyboard gate; static-still fallback if MCP down)
- **b03 briefam** — AM idle/listening motion at a desk, LOCKED camera, ends on start pose.
- **b02 crmnotes** — optional: typing-hands loop instead of pure code field-fill, if it reads better.
No multi-person crowd beats in this lesson (unlike 6A's b02 office) — simpler animation load than 6A.

## Transitions (per-beat, applying the 2026-07-08 location-plane rule)
- **b01→b02**: 1A-style camera-travel **slide** — Andrea's no-set hero shot to the CRM-desk scene reads
  as arriving at a new location.
- **b02→b03**: **slide** — rep's desk to the AM's desk is a genuine location change.
- **b03→b04**: **cut** — leaving the AM's desk scene for an icon/graphic panel (phone-transfer +
  calendar) isn't a location move; a slide there would falsely imply travel.
- **b04 internal (left panel→right panel)**: **cut/reveal**, not a slide (see beat table — corrected
  from the original "camera-travel slide" language, since it's an icon-panel swap, not a scene move).
- **b04→b05**: **slide** — the icon graphic gives way to the seller's phone-call scene, a location
  arrival.
- **b05→b06**: **cut** — seller scene to the checklist-board graphic isn't a location move.
- **b06→b07**: **cut** — checklist-board graphic to the 3-panel X-list graphic; both are the same
  "no location" diagram space.
- **b07→b08**: **fade** — bookend out (the only other fade besides the b01 bookend in).
1.0s silent gap between every beat (inserted at manifest build).

## Master deviations to record
None. Cues 9–16 are carried 100% verbatim (the only structural change is the cosmetic cue-13/14
merge, already noted in `lesson-6B-script-clean.txt` — no wording altered). Cue 16 is the module's
real closing line and is preserved exactly, unlike 6A which needed a stitched bridge outro.
