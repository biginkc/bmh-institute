# Module 18 - Lesson 18B "Daily Mission Control" scene cards (2026-07-07)

Script: `lesson-18B-script-clean.txt` (locked master Slot 18 Daily Mission Control, `Chapter 18 - Draft.srt`, cues 1-10, verbatim). Format follows `scene-card-v2.md` with guide/playbook overrides: Andrea voice speed stays `1.0`; all text is code-rendered via `Sticker`; no text is baked into generated stills.

**Gate:** text storyboard only. Generate no audio, stills, avatar clips, animations, or render until Jarrad approves this storyboard.

## Source cleanup
- SRT cue numbers, timestamps, blank lines, and code fences stripped.
- No stage directions were present.
- Andrea narrator wording is unchanged.
- Diff artifact: `lesson-18B-source-clean-vs-master.diff`.
- Master deviations: **none**. The closing meaning is preserved verbatim: this wraps the day-to-day playbook, assigns the family-dynamics roleplay, and tees up Slot 19 Career Growth Path.

## Scope call
This is one cohesive lesson. I do **not** recommend an A/B split because all 10 cues describe the same operating loop: county-channel communication, approval flow, Sandra data hygiene, Slack handoffs, daily standups, escalation, team norms, and the final systems wrap.

## Cast and visual rules
- Narrator = Andrea: cafe hero bookends (`b2cd0545...`) on b01 and b14. Opening beat carries `<BmhBadge/>` lower-right.
- Visuals are grounded workflow scenes: Slack county-channel organization, Sandra CRM records, approval flow, handoff threads, CRM-plus-Slack dual communication, daily standup, manager escalation, and team alignment.
- All Slack/Sandra/DialPad/Gmail labels are later code-rendered overlays. Generated stills must use blank app-like panes, no real logos, no baked words, no screenshots, and no private/customer data.
- County names, seller summaries, tags, approval states, and system names appear only through Remotion `Sticker`/code overlays.
- Seedance later animates approved illustrated scene beats; if Higgsfield/MCP is unavailable, those beats can stay static with code push-in and the fallback must be flagged.
- Transitions later: slide/camera-travel between teaching beats; fade only into b01 and out of b14.

## Storyboard

| Beat | Cue | Andrea mode | Transcript context | Visual idea | Motion / assembly plan | Text via Sticker/code (trigger) |
|---|---|---|---|---|---|---|
| b01_command_center | 1 | hero-cafe + BMH badge | "team actually communicates and works together day to day" / "Slack is the command center" / "Sandra is where your leads and data live" / "decisions happen... approvals flow... team stays in sync" | Cafe Andrea opener on cornflower blue. Behind/around her, a clean code-rendered command-center diagram links three blank system panels: leads/data, decisions/approvals, and team sync. | HeyGen cafe hero later; BMH badge on opener. Code panels slide in behind Andrea without using real logos. | `DAILY MISSION CONTROL` (day to day), `SLACK = COMMAND CENTER` (command center), `SANDRA = LEADS + DATA` (leads and data), `TEAM IN SYNC` (sync) |
| b02_county_channels | 2 | voice-only | "organize Slack by county" / "Every market has its own channel" / "Jackson County... Clay County... St. Louis County..." / "organized by geography" | Approved-style doodle map prop: a hand-drawn cream paper map on the blue field, with a Missouri-like outline and wobbly county-like sections shaded in yellow/orange/cream. No Slack list, no UI panel, no vector/slide-icon style, no baked county names. | Generate replacement still in BMH doodle style; after approval, animate only subtle map/section emphasis. Remotion overlays county labels and active-channel highlight. | `COUNTY CHANNELS` (county), `JACKSON COUNTY` (Jackson), `ORGANIZED BY GEOGRAPHY` (geography), `KNOW WHERE TO LOOK` (where to look) |
| b03_approval_flow | 3a | voice-only | "draft an outbound text or email" / "approval process before it gets sent" / "post it in the appropriate county channel" / "manager reviews it" / "approve it or ask for changes" / "send it through DialPad or Gmail" | Approval conveyor: a draft message card starts in a county-channel pane, moves to a manager review desk, then branches to approved send through two blank outbound-tool tiles. Tool labels are code overlays only. | Generate still after approval; Seedance candidate for gentle card movement. Remotion owns approval/check/change/send labels and tool names. | `DRAFT -> REVIEW -> SEND` (approval process), `COUNTY CHANNEL` (county channel), `APPROVED` (approved), `CHANGES REQUESTED` (changes), `DIALPAD / GMAIL` (DialPad) |
| b04_quality_check | 3b | corner-circle | "Every message... represents the BMH Group" / "tone, content, and timing" / "Early on... everything" / "process speeds up" / "quality check" | Approved-style doodle scene with only two people and one review cue: BMH headset representative on the left, manager/reviewer with blank clipboard on the right, and one large magnifying glass between them. No background board, message draft card, checklist panel, approval badge, arrows, UI cards, envelopes, desk, table, screen, or decorative props. | Replacement still pending approval. After approval, animate only subtle two-person review/magnifying-glass motion. Andrea corner circle stays bottom-right. Remotion owns tone/content/timing and quality-check labels. | `TONE` (tone), `CONTENT` (content), `TIMING` (timing), `QUALITY CHECK` (quality check), `TRUST SPEEDS IT UP` (process speeds up) |
| b05_handoff_thread | 4 | voice-only | "lead gets serious" / "moving through discovery and heading toward a handoff" / "use threads in Slack" / "Tag the relevant team members" / "Lead ready for handoff..." / "Full notes in Sandra" / "immediate context" | Slack-style handoff thread: one contained thread card sits inside a county channel, with a compact handoff summary card and team tags pointing to a Sandra notes panel. The Diane/Dayton summary is code-rendered exactly later, not baked into art. | Generate still after approval; Seedance candidate for thread/card focus motion. Remotion overlays summary lines and tag chips on the trigger words. | `LEAD READY FOR HANDOFF` (Lead ready), `FULL NOTES IN SANDRA` (Full notes), `TAG THE TEAM` (Tag), `THREADS KEEP IT CONTAINED` (contained) |
| b06_sandra_packet | 5a | voice-only | "lead moves to Stage 4" / "make sure everything is pushed to Sandra first" / "Complete seller profile" / "discovery notes" / "motivation summary" / "timeline" / "property condition" / "price expectations" / "decision-maker" / "sensitivities or hot buttons" | Sandra CRM packet scene: a blank CRM profile fills with structured checklist sections, with a Stage 4 handoff marker at the top. No real UI screenshot; no baked labels. | Generate still after approval; Remotion checklist rows pop in as Andrea names each required item. Could stay pure code if still reads too screen-like. | `STAGE 4` (Stage 4), `PUSH TO SANDRA FIRST` (Sandra first), `SELLER PROFILE` (seller profile), `MOTIVATION` (motivation), `TIMELINE` (timeline), `DECISION-MAKER` (decision-maker), `HOT BUTTONS` (hot buttons) |
| b07_dual_handoff | 5b | voice-only | "post the handoff summary in Slack" / "tag the acquisition team member" / "dual communication" / "CRM data plus Slack notification" / "nothing falls through the cracks" | Split workflow: left side Sandra packet marked complete, right side Slack notification to acquisition, with a bridge line connecting both to a handoff tray. | Generate still after approval; Seedance candidate for subtle bridge/card motion. Remotion overlays `CRM DATA + SLACK NOTIFICATION` and a falling-card prevention visual. | `DUAL COMMUNICATION` (dual communication), `CRM DATA + SLACK NOTIFICATION` (CRM data), `TAG ACQUISITION` (acquisition), `NOTHING FALLS THROUGH` (falls through) |
| b08_response_loop | 6 | voice-only | "sellers respond to your texts or emails" / "log the response in Sandra immediately" / "post it in the appropriate county channel" / "needs attention" / "ready to move forward... questions... objection" / "tag the right person" / "handle it and log it" | Response triage loop: incoming seller response card lands, then splits into "log in Sandra," "post county update," "tag help," or "handle callback" lanes. All lane labels are code. | Generate still after approval; Seedance candidate for card-to-lane motion. Remotion highlights the correct lane as each transcript phrase lands. | `LOG IMMEDIATELY` (immediately), `POST COUNTY UPDATE` (county channel), `TAG THE RIGHT PERSON` (tag), `HANDLE + LOG` (handle it and log it) |
| b09_daily_standup | 7 | voice-only | "daily standups in Slack" / "How many dials" / "standout conversations" / "Leads that moved stages or got handed off" / "stuck on" / "planning for tomorrow" / "Three to five lines" / "stay aligned" | Daily standup board: five short blank line slots inside a Slack-style channel, with a manager/team review row below. The visual is dense but clean; no baked text. | Generate still after approval; Remotion fills five code lines one by one and ends with a team alignment highlight. | `DAILY STANDUP` (daily standups), `DIALS` (dials), `STANDOUTS` (standout), `MOVED / HANDED OFF` (handed off), `STUCK` (stuck), `TOMORROW` (tomorrow), `3-5 LINES` (Three to five) |
| b10_ask_manager | 8 | voice-only | "not sure how to handle" / "tricky objection" / "unusual property" / "don't guess" / "Post in Slack and tag your manager" / "Chapter 13 bankruptcy" / "Notes in Sandra" / "keep working your other leads" / "better to ask" | Manager escalation scene: one tricky-case card is posted in a county channel and tagged to manager; a side panel shows other leads continuing in a work queue while guidance is pending. The KC/Chapter 13 note is code text only. | Generate still after approval; Seedance candidate for calm multitask motion. Remotion overlays the sample escalation note and `DO NOT GUESS` emphasis. | `DON'T GUESS` (don't guess), `TAG YOUR MANAGER` (tag your manager), `NOTES IN SANDRA` (Notes in Sandra), `KEEP WORKING` (keep working), `BETTER TO ASK` (better to ask) |
| b11_team_norms | 9a | voice-only | "Over-communicate" / "share it anyway" / "respond within the hour" / "Keep everything professional" / "work tool, not a group chat with friends" | Team operating-norms lockup: three code-rendered norm cards over a grounded Slack workspace scene: share more, respond within the hour, keep it professional. | Mostly code-driven; optional simple still background of a team workspace with blank channel panes. Remotion owns all text and timing. | `OVER-COMMUNICATE` (Over-communicate), `RESPOND WITHIN THE HOUR` (within the hour), `KEEP IT PROFESSIONAL` (professional), `WORK TOOL` (work tool) |
| b12_wins_momentum | 9b | voice-only | "when something good happens" / "deal closes" / "great call" / "lead finally converts after weeks of follow-up" / "post it" / "Celebrate it" / "Wins build momentum for the whole team" | Wins board: team sees a closed-deal/great-call celebration post in the channel; small momentum meter lifts for the whole team, not one person. Keep celebration restrained and work-focused. | Generate still after approval; Seedance candidate for subtle team reaction/momentum motion. Remotion overlays win types and momentum label. | `POST THE WIN` (post it), `CELEBRATE IT` (Celebrate), `DEAL CLOSED` (deal closes), `GREAT CALL` (great call), `TEAM MOMENTUM` (momentum) |
| b13_systems_wrap | 10a | voice-only | "leads live in the CRM" / "communication lives in Slack" / "calls go through DialPad" / "team stays connected through those three systems" / "Learn the flow, follow the process" | Systems triad: three connected pillars for CRM, Slack, and DialPad on a single mission-control board, with the team line running through all three. Labels are code-only. | Pure code or generated blank mission-control board after approval. Remotion connects the three systems with a clean path animation. | `CRM` (CRM), `SLACK` (Slack), `DIALPAD` (DialPad), `LEARN THE FLOW` (Learn the flow), `FOLLOW THE PROCESS` (follow the process) |
| b14_roleplay_career_tease | 10b | hero-cafe | "wraps up your day-to-day playbook" / "elderly seller in Dayton whose adult son is opposed to the sale" / "navigate family dynamics with patience" / "one more stop: where this role can take you" | Cafe Andrea close on cornflower blue. Code-rendered roleplay card appears first, then a next-stop card for Career Growth Path. No generated family scene in the hero beat unless Jarrad asks; keep the close clean and direct. | HeyGen cafe hero later; fade out only at close. Roleplay and next-stop cards pop in word-timed. | `ROLEPLAY: DAYTON FAMILY DYNAMICS` (roleplay), `PATIENCE + TRUST` (patience), `NEXT: CAREER GROWTH PATH` (one more stop), `WHERE THIS ROLE CAN TAKE YOU` (can take you) |

## Planned stills after approval
- `m18_L18B_b02_county-channels.png` - replacement doodle map prop; county labels code-rendered later.
- `m18_L18B_b03_approval-flow.png` - outbound draft review pipeline from county channel to manager approval to send tools; no baked tool names.
- `m18_L18B_b04_quality-check.png` - simplified two-person quality review scene: headset rep left, manager with clipboard right, magnifying glass only; tone/content/timing labels code-rendered later.
- `m18_L18B_b05_handoff-thread.png` - contained Slack-style thread with handoff summary card and Sandra notes panel; all names/summary text code-rendered.
- `m18_L18B_b06_sandra-packet.png` - Sandra CRM handoff packet/checklist with blank fields; all checklist labels code-rendered.
- `m18_L18B_b07_dual-handoff.png` - Sandra packet plus Slack notification split workflow; bridge labels code-rendered.
- `m18_L18B_b08_response-loop.png` - seller response triage loop across log/post/tag/handle lanes; lane labels code-rendered.
- `m18_L18B_b09_daily-standup.png` - short standup channel board with five blank line slots; standup labels code-rendered.
- `m18_L18B_b10_ask-manager.png` - manager escalation while other lead work continues; sample case text code-rendered.
- `m18_L18B_b12_wins-momentum.png` - grounded team win/momentum board; celebration labels code-rendered.

## Pure code beats after approval
- b01: hero bookend with command-center panel overlays and BMH badge.
- b11: team-norms lockup, optionally over a simple blank workspace plate.
- b13: CRM / Slack / DialPad systems triad.
- b14: hero bookend with roleplay and Career Growth Path next-stop cards.

## Andrea clips after approval
- b01 cafe Andrea opening, with BMH badge in Remotion.
- b04 optional corner-circle Andrea over the quality-check scene.
- b14 cafe Andrea closing.

## Animation candidates after still approval
- b02 replacement map: subtle approved-style map emphasis after still approval.
- b03 approval flow: draft card moves through review and approved-send path.
- b04 replacement quality check: subtle two-person review/magnifying-glass motion after still approval.
- b05 handoff thread: subtle thread/card focus motion.
- b07 dual handoff: CRM packet and Slack notification bridge motion.
- b08 response loop: response card moves into the correct triage lane.
- b09 standup: line slots fill or gently highlight in sequence.
- b10 ask manager: escalation card holds while other leads continue in a side queue.
- b12 wins momentum: restrained team reaction and momentum lift.

All animation must use Seedance triple-clamp with style refs after approval. If Higgsfield/MCP is unavailable, use static stills with code push-in and flag the fallback.
