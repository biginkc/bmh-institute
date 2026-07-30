# Module 18 - Lesson 18A "Operator Playbook" scene cards (2026-07-07)

Script: `lesson-18A-script-clean.txt` (locked master Slot 18 Operator Playbook, `Chapter 17 - Draft.srt`, cues 1-14, verbatim). Format follows `scene-card-v2.md` with guide/playbook overrides: Andrea voice speed stays `1.0`; all text is code-rendered via `Sticker`; no text is baked into generated stills.

**Gate:** Stage 1 text artifacts created in this session. The execute block says Jarrad has approved moving past the storyboard gate and wants still images generated after these artifacts exist. Generate only the eight requested stills now. Do not generate audio, HeyGen clips, Seedance clips, Remotion renders, or QC queue rows.

## Source cleanup
- SRT cue numbers, timestamps, blank lines, and code fences stripped from the locked master block.
- No stage directions were present.
- Andrea narrator wording is unchanged.
- Diff artifact: `lesson-18A-source-clean-vs-master.diff`.
- Master deviations: **none**. The raw `Chapter 17 - Draft.srt` is a rough two-cue source with stale wording; the locked master Slot 18 block is canonical and is preserved verbatim here.

## Scope call
This is one cohesive lesson. I do **not** recommend an A/B split because all 14 cues describe one operator day: clock-in, research, call blocks, breaks, admin, pipeline review, "worked the day," energy management, and the human reason the numbers matter. Daily Mission Control is the next Slot 18 lesson and stays in its own `lesson18B` / `module-18-lesson18B` paths.

## Cast and visual rules
- Narrator = Andrea: cafe hero bookends (`b2cd0545...`) on b01 and b14. Opening beat carries `<BmhBadge/>` lower-right.
- Operator scenes use Priya / BMH follow-up representative identity where possible: black back ponytail, orange/yellow headband, orange headset with boom mic, yellow top, cream pants, flat white/cream face, small dot eyes, tiny curved cast-board nose, simple mouth.
- Seller/customer in b13 must be a distinct non-Andrea character. Use a simple curly dark-haired seller in an orange sweater/cream pants, flat white/cream face, and no headset.
- All HubStaff, Sandra, CRM, PropStream, stage labels, dial counts, checklist items, dates, and app/tool names are later code-rendered overlays. Generated stills must use blank panes/cards/rows only: no logos, screenshots, readable UI, words, letters, or numbers.
- No ambient doodles: no hearts, sparkles, notes, thought bubbles, speech bubbles, motion marks, random icons, or decorative clutter.
- Seedance later animates approved illustrated scene beats; if Higgsfield/MCP is unavailable, those beats can stay static with a code push-in and the fallback must be flagged.
- Transitions later: slide/camera-travel between teaching beats; fade only into b01 and out of b14.

## Storyboard

| Beat | Cue | Andrea mode | Transcript context | Visual idea | Motion / assembly plan | Text via Sticker/code (trigger) |
|---|---|---|---|---|---|---|
| b01_put_it_together | 1 | hero-cafe + BMH badge | "covered a lot of ground" / "put all of it together" / "what a real day actually looks like" | Cafe Andrea opener on cornflower blue with BMH badge only. No title card, subtitle, or floating text labels in the opener. | HeyGen cafe hero; no generated still needed. Opener remains text-free except BMH badge. | None. |
| b02_command_center_priorities | 2 | voice-only | "clock in on HubStaff and open Sandra" / "command center" / "follow-up list" / "Stage 3... Stage 2... Stage 1" | Priya at a clean morning workstation with laptop, monitor, phone, and one tidy notepad. No baked empty background tile boards or card stacks. Stage priority, if shown, must be code-rendered labeled tiles timed to narration. | Generate cleaned still for Jarrad image gate before animation. Remotion overlays only the approved queued labels. | `COMMAND CENTER` (command center), `SORT PRIORITIES` (priorities) |
| b03_research_prep | 3 | voice-only | "first half hour" / "PropStream" / "top 10 to 15 leads" / "ownership... liens, tax status, mortgage info" | Priya sits at the long side of a clean desk. Laptop screen faces her with the back of the laptop toward camera. Desk carries only laptop plus one tidy notepad or folder. Cast-board anchored. No cards, property icons, map pins, or clutter. | Regenerate from scratch for Jarrad image gate before animation. Remotion owns all labels and tool names. | `30-MINUTE PREP` (half hour), `10-15 TOP LEADS` (10 to 15), `DO YOUR HOMEWORK` (homework) |
| b04_first_call_block | 4 | voice-only | "first calling block" / "Follow-ups first" / "scheduled callbacks" / "60 to 80 dials" / "log notes" / "follow-up texts" | Priya in active calling posture at a clean desk with headset, phone or compact keyboard, and one notepad. No baked empty background boards, message bubbles, queue cards, or schedule strips. | Regenerate cleaned still for image gate because it shares the rejected desk-board motif. Remotion overlays dial target and call-order labels. | `FOLLOW-UPS FIRST` (Follow-ups), `60-80 DIALS` (60 to 80), `LOG NOTES NOW` (log notes) |
| b05_break_reset | 5 | voice-only | "Take a break" / "fifteen minutes" / "Stretch" / "water" / "Reset your energy" | Priya away from screen stretching or standing with a water bottle; desk visible but idle; calm reset, no gag, no ambient marks. | Generate still now; later likely static push-in or subtle Seedance reset motion. Remotion overlays break/reset label. | `15-MINUTE RESET` (fifteen), `STEP AWAY` (away), `WATER + STRETCH` (water), `RESET ENERGY` (Reset) |
| b06_second_block_lunch | 6 | voice-only | "Second calling block" / "texts and emails" / "110 to 150 dials" / "Lunch" / "Eat real food" | Code-led dial counter and lunch break card over a minimal blank call-list board; no new still required unless the still gate asks for one. | Pure Remotion counter/cards can cover this beat; optionally reuse b04 visual language after still approval. | `SECOND BLOCK` (Second), `TEXTS + EMAILS` (texts and emails), `110-150 BY LUNCH` (110 to 150), `REAL FOOD` (real food) |
| b07_admin_block | 7 | voice-only | "admin block" / "follow-up emails" / "Update lead stages" / "handoff checklists" / "notes that need detail" | CRM admin: Priya typing at a keyboard facing her monitor. Minimal desk with monitor, keyboard, phone, and at most one tidy notepad. No clipboard, paper piles, pen cup, letter trays, baked stage cards, or background tile boards. | Regenerate from scratch for Jarrad image gate before animation. Remotion overlays admin labels only if still needed by rule. | `ADMIN BLOCK` (admin block), `UPDATE STAGES` (stages), `HANDOFF CHECKLISTS` (checklists) |
| b08_final_call_block | 8 | voice-only | "final calling block" / "last push" / "re-dials" / "every lead scheduled for today" / "150 to 200 total dials" | Code-led final push board: blank call queue narrows, re-dial chip returns to unanswered cards, total dial counter lands at target. | Pure Remotion/code can handle this beat; if a human plate is needed, reuse b04's approved operator language. | `FINAL PUSH` (last push), `RE-DIALS` (re-dials), `EVERY SCHEDULED LEAD` (every lead), `150-200 TOTAL` (150 to 200) |
| b09_pipeline_review | 9 | voice-only | "pipeline review" / "big picture" / "stuck in Stage 1" / "Stage 3... ripe for handoff" / "next action with a specific date" / "tomorrow" | End-of-day pipeline review at a clean desk with one monitor or simple CRM surface. No baked empty background tile boards, stage columns, card stacks, calendars, or checklist clutter. Meaningful stage tiles must be code-rendered and word-timed. | Regenerate cleaned still for Jarrad image gate before animation. Remotion overlays stage, next-action, tomorrow labels and dates. | `PIPELINE REVIEW` (pipeline review), `NEXT ACTION + DATE` (specific date), `TOMORROW READY` (tomorrow) |
| b10_worked_the_day | 10 | voice-only | "worked the day" / dial target, scheduled follow-up, notes, texts/emails, stages, next action, clean pipeline, full hours | Code-rendered checklist of "worked the day" criteria, using V1 Sticker/card style. No generated text in art. | Pure Remotion checklist; rows pop as Andrea names each criterion. | `WORKED THE DAY` (worked the day), `DIAL TARGET` (dial target), `SCHEDULED FOLLOW-UPS` (scheduled), `DETAILED NOTES` (notes), `NEXT ACTIONS` (next action), `PIPELINE CLEAN` (clean), `FULL HOURS` (full hours) |
| b11_control_consistency | 11 | voice-only | "controlled what you could control" / "consistency" / "not one heroic day" / "every single day" | Code-rendered consistency calendar/control board: days fill in, control levers stay steady even when pickup/deal result cards are blank. | Pure Remotion calendar/control metaphor; no still needed. | None. |
| b12_energy_management | 12 | voice-only | "marathon" / "150-plus calls a day" / "Smile before you dial" / "breaks" / "hydrated" / "real food" / "five minute walk" / "small wins" | Priya with headset and water at a clean workspace. Minimal props only: water, phone, laptop, and at most one notepad. No baked empty boards, checklist panels, shoes, path cards, or scenery cards. | Regenerate cleaned still for image gate because it shares the rejected desk-board motif. No Remotion labels currently scheduled. | None. |
| b13_one_call_humans | 13 | voice-only | "one call" / "numbers game... run by humans" / "genuine care" / "keep calling... listening... follow through" | Warm phone conversation split scene: Priya listening with headset on one side; distinct non-Andrea seller on the other side of the call; care/follow-through without hearts or sentiment doodles. | Generate still now; later Seedance candidate for subtle listening/phone conversation motion. Remotion overlays the human/numbers/care frame. | `ONE CALL CAN CHANGE THE DAY` (one call), `NUMBERS + HUMANS` (humans), `GENUINE CARE` (care), `KEEP LISTENING` (listening), `FOLLOW THROUGH` (follow through) |
| b14_daily_sync_tease | 14 | hero-cafe | "capstone roleplay" / "full-cycle scenario" / "one more piece: how the team stays in sync day to day" | Cafe Andrea close on cornflower blue. Code-rendered roleplay card appears, then next-lesson card tees up Daily Mission Control. | HeyGen cafe hero later; fade out only at close; no generated still needed. | `CAPSTONE ROLEPLAY COMING` (capstone), `FULL-CYCLE SCENARIO` (full-cycle), `NEXT: DAILY MISSION CONTROL` (team stays in sync), `TEAM STAYS IN SYNC` (sync) |

## Planned stills now
- `m18_L18A_b02_command-center.png` - Priya at morning workstation with blank Sandra-style task list and stage-priority cards.
- `m18_L18A_b03_research-prep.png` - Priya researching top leads with blank property/map panel and lead cards.
- `m18_L18A_b04_first-call-block.png` - Priya in active first-call block with call queue, note sheet, blank message bubbles, and schedule strip.
- `m18_L18A_b05_break-reset.png` - Priya stepping away for water/stretch reset, desk idle in background.
- `m18_L18A_b07_admin-block.png` - Priya updating emails, CRM stage cards, handoff checklist, and notes.
- `m18_L18A_b09_pipeline-review.png` - end-of-day pipeline board with stage columns, next-action chips, tomorrow task list, and clock-out feel.
- `m18_L18A_b12_energy-management.png` - Priya smiling before dialing with water, clean workspace, and blank small-win checks.
- `m18_L18A_b13_one-call-humans.png` - Priya listening on a warm call with a distinct non-Andrea seller.

## Pure code beats after approval
- b01: hero opener with prior-course chips, real-day workflow card, and BMH badge.
- b06: second-block/lunch counter and break card.
- b08: final-call-block total counter and re-dial board.
- b10: "worked the day" checklist.
- b11: control/consistency calendar.
- b14: hero close with capstone roleplay and Daily Mission Control tease cards.

## Andrea clips after approval
- b01 cafe Andrea opening, with BMH badge in Remotion.
- b14 cafe Andrea closing.

## Animation candidates after still approval
- b02 command center: subtle active-card / morning clock-in movement.
- b03 research prep: calm property panel and lead-card focus movement.
- b04 first-call block: headset/calling posture and note-card movement.
- b05 break reset: gentle stretch/water reset, no comedy or ambient marks.
- b07 admin block: blank email/CRM/checklist cards organize in sequence.
- b09 pipeline review: stage-column and next-action highlight movement.
- b12 energy management: subtle smile/headset/water movement.
- b13 one-call humans: warm listening posture on both sides of the call.

All animation must use Seedance triple-clamp with style refs after still approval. If Higgsfield/MCP is unavailable, use static stills with code push-in and flag the fallback.
