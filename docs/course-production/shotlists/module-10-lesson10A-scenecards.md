# Module 10 - Lesson 10A "Follow-Up Cadence" scene cards (2026-07-06)

Script: `lesson-10A-script-clean.txt` (1,168 words, approximately 7 min). Source: locked master `_master-transcripts.md` Slot 13 (`Chapter 9 - Final.srt`), cues 1-14, verbatim.
Format per `scene-card-v2.md`. Voice: Elizabeth-Friendly all beats. **APPROVED & FINAL by Jarrad on 2026-07-09.**

## Final render
- Final approved cut: `course-assets/review-lesson10A/LESSON-10A-v6.mp4` (7:17.7, 13 beats, 1600x900 H.264/AAC, yuv420p limited BT.709).
- Claude QC: `course-assets/review-lesson10A/QC-REPORT-v6.md` PASS. v6 supersedes v5 after a b13-only HeyGen reroll fixed the outro hand/glow artifact.
- Final label rule: floating teaching labels use a single bottom-center queue. Only purposeful attached overlays remain off-bottom: b02 tile labels, b05 calendar marks, b10 message-bubble labels, and the b11 STOP word on the sign.
- Final transition rule: Lesson 1A-style camera-travel slides are used only when the cut reads as moving to a new plane/location; hero/Andrea bookend transitions fade.

## Source cleanup
- Raw `.srt` had stage directions, stale sample names ("Sandra"), stale CRM wording ("REsimpli"), broken spacing/quotes, and truncated sample copy.
- Final clean script follows the locked master exactly after cleanup: narrator/sample speaker is Andrea, CRM priority is Sandra, and the next-lesson tease stays with Slot 13.
- Diff artifact: `lesson-10A-source-clean-vs-master.diff`.

## Scope call
The slot is long but cohesive. I am keeping it as one lesson because the cadence, ghost-text examples, when-to-stop rules, and daily follow-up discipline all teach one operating behavior. Splitting after the cadence would strand ghost texts and stop rules in a weaker follow-up fragment.

## Cast and visual rules
- Narrator = Andrea: cafe hero bookends (`b2cd0545...`) plus headset corner-circle (`e527528e...`) where useful.
- Seller character appears in b03 and b09. Single-seller scenes must be generated as exactly one person, no clone, no extra background people.
- Visuals are generated scene images or Andrea shots, not code-built diagrams. Remotion is only for transitions, text overlays, checkmark overlays if needed, and timing.
- All on-screen text is code-rendered with Sticker/Baloo style. No text baked into stills. Spell out meanings plainly; do not use shorthand symbols like `!=`.
- BMH badge appears on opening beat b01.
- Animation model lock: use `seedance_2_0` for any approved still animation. Do not use Kling for this lesson.
- Animation prompt lock: animate the approved still only; preserve exact character identities, composition, color palette, and flat sticker style. Subtle natural head, mouth, hand, and prop motion only. No scene cuts, camera swings, new props, text, style-reference sheets, clone characters, face drift, or nose drift.
- Duration rule: use exact beat durations after audio exists. If a beat exceeds the model max duration, generate adjacent Seedance shot segments; do not stretch one clip into a loop or forward/reverse ping-pong. Hold the AI clip's own final frame, not the original still.

## Storyboard

| Beat | Cue | Andrea mode | Visual | Motion / assembly plan | Text (trigger) |
|---|---|---|---|---|---|
| b01_intro | 1 | hero-cafe + BMH badge | Cafe Andrea opens on cornflower blue. The lesson starts direct and emphatic. | HeyGen hero clip. Fade in only at open. Clean opener: no text labels. | none |
| b02_deals_happen | 2 | voice-only | Full-frame square-panel/tile visual. Each square fills the composition as it appears: first call, second call, third call, seventh call. The look is a generated tile scene, not a Remotion ladder. | Generated still source with Remotion timing/transitions only. Text overlays identify each square as it appears. | `FIRST CALL` (first call), `SECOND CALL` (second call), `THIRD CALL` (third call), `SEVENTH CALL` (seventh call). |
| b03_not_ready | 3 | corner-circle | One overwhelmed seller at a kitchen table with phone, mail, property folder, and a small house photo. Bottom-right pocket reserved for Andrea circle. | Approved Seedance clip with subtle motion; exactly one person, no clone. | `NOT READY TODAY DOES NOT MEAN NOT INTERESTED` (not ready today), `BE THERE WHEN THEY'RE READY` (ready). |
| b04_fifth_touch | 4 | voice-only | Full-frame square/tile visual language: two faded squares for investors who quit after one or two touches, then five-plus strong squares for the person who keeps following up. | Generated still source with Remotion timing/transitions only. Avoid chart/graph styling. | `MOST QUIT AFTER TWO` (one or two), `FIVE OR MORE TOUCHES` (five). |
| b05_day_1_to_30 | 5 | voice-only | Full flat calendar base image on blue. Exact Day 1, Day 2, Day 4, Day 7, Day 14, Day 21, and Day 30 labels/checkmarks are Remotion overlays, not baked into the still. | Generated calendar still with blank grid. Remotion overlays all clean checkmarks/day labels. | `DAY 1` (first day), `DAY 2` (day two), `DAY 4` (day four), `DAY 7` (day seven), `DAY 14` (day fourteen), `DAY 21` (day twenty-one), `DAY 30` (day thirty). |
| b06_monthly_cadence | 6 | hero-andrea | Full-frame Andrea on standard course blue. Andrea is the primary visual, not a calendar/card diagram. | HeyGen hero clip. Bottom-center text overlay only. | `MONTHLY CADENCE` (monthly). |
| b07_second_call | 7 | corner-circle | CRM note card and phone receiver on a clean desk, with a code-rendered sample script card. | Generated desk/phone still with Remotion text overlays. Andrea circle reinforces that this is the sample call. | `REFERENCE THE LAST CONVERSATION` (previous conversation), sample cue `WE TALKED A FEW DAYS AGO` ("We talked"). |
| b08_bring_new | 8 | voice-only | Newspaper clipping visual suggesting recent local sales or neighborhood activity. No map/dashboard concept. | Generated newspaper-clipping still. Remotion overlays the lesson label; no baked article text required. | `BRING SOMETHING NEW` (new), `NOT JUST CHECKING IN` (check in). |
| b09_silent_seller | 9 | voice-only | Seller under a ghost sheet: the sheet covers the seller like a ghost costume, with feet visible underneath so it reads as the seller hiding/ghosting. | Generated still. Prompt as a humorous metaphor while staying on-brand; exactly one hidden seller, no extra people. | `GHOST TEXTS` (ghost texts). |
| b10_ghost_texts | 10-11 | voice-only | Generated phone/message visual. Remotion text bubbles overlay the four approaches. | Generated phone still with Remotion bubbles only; no baked text in the image. | `CASUAL CHECK-IN` (casual), `ASSUMPTIVE` (assumptive), `VALUE ADD` (value add), `YES OR NO` (yes/no). |
| b11_when_to_stop | 12 | voice-only | Simple red stop-sign visual on course blue, not a code decision tree or crossroads scene. | Generated still with a clean Remotion `STOP` word centered on the sign. No extra floating lesson labels. | `STOP` rendered on the sign. |
| b12_daily_priority | 13 | hero-andrea | Full-frame Andrea on standard course blue. Andrea is the primary visual instead of a Sandra queue/dashboard. | HeyGen hero clip. Bottom-center text overlay only. | `FOLLOW-UPS FIRST` (before new leads). |
| b13_outro | 14 | hero-cafe | Cafe Andrea closes. Small code card previews roleplay: probate lead, St. Louis, inherited house, empathy plus persistence. Ends with next lesson tease. | HeyGen hero clip. Fade out only at close. | `PROBATE LEAD - ST. LOUIS` (probate), `NEXT: ONE FLOW` (one flow). |

## Generated stills used in final
- `m10_L10A_b02_touch-squares.png` - full-frame square/tile touch visual: first, second, third, seventh calls.
- `m10_L10A_b03_not-ready.png` - one overwhelmed seller at kitchen table, exactly one person.
- `m10_L10A_b04_persist-squares.png` - two faded quit squares plus five-plus strong follow-up squares.
- `m10_L10A_b05_calendar-checks.png` - full blank calendar base; exact day numbers/checkmarks are Remotion overlays.
- `m10_L10A_b07_second-call.png` - clean desk prop still for CRM note plus phone receiver.
- `m10_L10A_b08_newspaper-clipping.png` - newspaper clipping visual for recent neighborhood activity.
- `m10_L10A_b09_ghost-sheet-seller.png` - seller hidden under a ghost sheet, feet visible, exactly one hidden seller.
- `m10_L10A_b10_phone-messages.png` - phone/message base visual for Remotion bubbles.
- `m10_L10A_b11_crossroads-stop.png` - final simple red stop-sign visual for when to stop.

## Animation in final
- Primary model lock remained `seedance_2_0`.
- b03 seller-at-table uses the approved Seedance clip with a held own-final-frame tail.
- Other illustrated beats remain still/push-in or Remotion-overlaid compositions.

## Andrea clips used in final
- b01 cafe Andrea opening.
- b06 full-frame Andrea for monthly cadence.
- b12 full-frame Andrea for daily priority.
- b13 cafe Andrea closing.

All remaining non-Andrea beats are generated-still based or Remotion-overlaid compositions. No code-built diagrams.
