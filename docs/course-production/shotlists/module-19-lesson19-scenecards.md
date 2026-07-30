# Module 19 - Lesson 19 "Career Growth Path" scene cards (2026-07-07)

Script source: `lesson-19-script-clean.txt` (locked master Slot 19 Career Growth Path, `Chapter 13 - FINAL.srt`, cues 1-10, plus the approved deviations recorded in `lesson-19-source-clean-vs-master.diff`). Beats b02, b03, b05, b12, and b13 intentionally differ from the master. Andrea voice speed stays `1.0`; static prop text may be baked into art, while timed callouts remain Remotion text.

**Current gate:** v7 correction candidate is in Claude QC. Jarrad reviews only a Claude-QC-passed candidate.

## Source cleanup
- SRT cue numbers, timestamps, blank lines, and code fences stripped.
- No stage directions were present.
- Andrea narrator wording is unchanged in b01, b04, and b06-b11. Approved narration deviations exist in b02, b03, b05, b12, and b13.
- Diff artifact: `lesson-19-source-clean-vs-master.diff`.
- Master deviations: b02 and b03 are role-agnostic rewrites; b05 retains `Earnings can grow with performance.`; b12 asks `Is your work producing revenue?`; b13 replaces the course-ending master close with the approved career-growth topic close. These deviations are intentional and must not be reverted.
- Local source note: repo search did not find `Chapter 13 - FINAL.srt`; the locked master transcript block was used as source of truth.

## Scope call
This remains one cohesive lesson with no A/B split. It closes the career-growth topic only. It no longer claims to end onboarding or the full training program, because a separate training-finale video may follow.

## Cast and visual rules
- Narrator = Andrea: cafe hero bookends (`b2cd0545...`) on b01 and b13. Opening beat carries `<BmhBadge/>` lower-right.
- This is a career-growth capstone, not a generic corporate ladder. The visual spine should be a grounded BMH career path built out of leads, sellers, pipeline stages, handoff packets, offer negotiation, team coaching, and revenue-producing closed deals.
- Use real-work pictures, not motivational abstractions: clean CRM cards, seller conversations, pipeline handoffs, offer table, signed contract, team coaching board, expansion map.
- The user-supplied compact Priya crop is the highest-priority identity/body anchor for b02, b03, b05, b06, and b08. Every illustrated face and hand is pure flat white.
- Static prop text is baked into b02, b03, and b05 where specified by the v6 plan. Timed callouts remain Remotion text. No logos/screenshots, private/customer data, skin tones, gradients, ambient doodles, or purposeless floor objects.
- Seedance later animates approved illustrated scene beats; if Higgsfield/MCP is unavailable, those beats can stay static with code push-in and the fallback must be flagged.
- Transitions later: slide/camera-travel between teaching beats; fade only into b01 and out of b13.
- Final cue has no next-lesson tease and no training-completion language. It ends with Andrea encouraging the learner to keep discussing where they want to grow next.

## Script context
This lesson explains how current performance can turn into a career path at BMH. It is not the final training send-off.

The script's argument is:
1. Your first job is not small; it is the foundation.
2. The way you earn the next step is observable: consistent numbers, clean CRM, good calls, clean handoffs, coachability, and revenue-producing leads.
3. Growth is not a vague ladder. It becomes more complex lead handling, more autonomy, mentoring, direct offer/negotiation ownership, and eventually team leadership.
4. The close reinforces continued growth, coaching, and an ongoing conversation about the learner's next step.

Every image has to make one part of that argument legible before any text appears. If the viewer only sees a generic ladder, trophy, motivational mountain, or corporate promotion chart, the scene fails.

## Approved v6 revision lock (2026-07-10)

- b01 stays clean: cafe Andrea plus BMH badge only; no opener text or path diagram.
- b02, b03, b05, b06, and b08 use the saved compact Priya anchor. Versioned stills preserve the prior composition while correcting body proportions and pure-white skin.
- b02 bakes `RAW LEAD`, `QUALIFICATION`, and `QUALIFIED LEAD`; only `FOUNDATION` remains timed.
- b03 removes the floor tray, bakes `CLEAN FILE` and `READY FOR ACQUISITION`, and queues the three mastery callouts bottom-center.
- b05 has no empty plaques; `PROBATE`, `MULTI-OWNER`, and `DISTRESS` are meaningful integrated maze labels. Mentor/autonomy callouts queue bottom-center.
- b06 has no readable text or Remotion labels. Priya and every audience member have pure-white skin.
- b07 is native 1600x900 cafe Andrea with no zoom, graphic, or labels.
- b08 queues transient management labels one at a time without covering either person or the computer.
- b10 labels and timed checkmarks share the scorecard transform and align to the five physical rows.
- b11 keeps five evenly spaced cards above the review-player control area.
- b13 uses two full-frame calm-hands cafe takes, no labels or props, and this exact narration:

> I hope this gives you a clear picture of the growth paths available at BMH. Your path will depend on what you're good at, where you want to go, and the results you produce. We're confident you can continue growing here if you keep improving and stay open to coaching. Keep the conversation going about where you want to grow next.

The original storyboard below is retained as design history. This v6 revision lock supersedes every conflicting opener, label, Priya, b07, scorecard, and outro instruction in it.

## What each visual must let the viewer detect

| Beat | Script point | Viewer should detect before reading stickers | Reject the visual if it reads as |
|---|---|---|---|
| b01_career_path_opener | Starting point can grow into a real BMH path. | A path made from actual BMH work stations: leads, handoff, offers, coaching, expansion. | Generic corporate ladder, abstract success graphic, motivational poster. |
| b02_foundation_role | Foundation = working raw leads into qualified leads. | A conveyor belt feeds a raw lead card into a machine; a qualified lead card comes out the other side. | Generic office, desk work, or a conveyor that does not visibly transform raw lead into qualified lead. |
| b03_clean_handoffs | Mastery means acquisition gets clean, documented, ready leads. | A BMH rep lovingly hugs a folder/lead file so the viewer reads "this file is clean and cared for." | A generic folder, vague handshake, or handoff with no emotional "clean file" read. |
| b04_readiness_checkpoint | Promotion starts when performance proof is visible. | A checkpoint/scorecard where consistency, CRM cleanliness, and leadership are what unlock the next step. | Calendar tenure, seniority clock, or "promotion because time passed." |
| b05_complex_leads_mentor | Next level = navigating complicated lead situations. | A BMH rep finds her way through a complex maze; the maze contains code-rendered labels for `PROBATE`, `MULTI-OWNER`, and `DISTRESS`. | Generic maze, baked/garbled text, or complexity that is not visibly tied to lead situations. |
| b06_deal_closer_level | Closer level = offers, terms, negotiation, signed contract. | A BMH rep is on stage at a packed conference presenting the sales/deal process: offers, terms, negotiation, signed contract. | Pure motivational conference, generic speaker, or sales talk with no offer/contract mechanics. |
| b07_creative_deal_skill | Higher expectations require negotiation skill, market knowledge, and creative structure. | Full-frame cafe Andrea explains the higher bar directly. | Any deal-path graphic, zoomed crop, floating label, or abstract creativity metaphor. |
| b08_management_path | Management = coaching and owning team output. | Priya helps another headset-wearing rep at a computer, making coaching and team performance visible. | Org chart, boss desk, or a manager standing above people without helping. |
| b09_no_fixed_schedule | Promotion is readiness, not elapsed time. | Andrea is speaking while reading a promotion/readiness scorecard; the scorecard is the proof, not the calendar. | Countdown, anniversary, time-served promotion, or Andrea holding a generic document. |
| b10_daily_performance_criteria | Daily proof = numbers, call quality, clean CRM, every lead has a plan. | The promotion scorecard close-up shows criteria rows for numbers, call quality, CRM cleanliness, notes, stage, and next action. | KPI dashboard only, call headset only, or a checklist that does not show lead-plan hygiene. |
| b11_team_contribution_coachability | Fast growers help, share, accept feedback, and improve. | Team contribution plus feedback turning into a corrected/improved process. | Group high-five, generic teamwork, or scolding/defensive scene. |
| b12_revenue_opportunity | Revenue-producing leads create opportunity as BMH expands. | Clean handoffs become closed deals, which open new markets/teams/positions. | Money rain, generic map expansion, or opportunity not tied to closed deals. |
| b13_course_close | The learner should understand how growth works and keep discussing their next step. | Calm full-frame cafe Andrea closes the topic without implying that training is over. | Phone prop, welcome card, course-completion language, labels, zoom, or an end card. |

## Storyboard

| Beat | Cue | Andrea mode | Transcript context | Visual idea | Motion / assembly plan | Text via Sticker/code (trigger) |
|---|---|---|---|---|---|---|
| b01_career_path_opener | 1 | hero-cafe + BMH badge | "Where you're starting is not where you have to stay" / "The BMH Group is growing" / "There's a real path here" | Cafe Andrea opener on cornflower blue. A grounded career-path board builds behind her: foundation work at left, complex leads, deal closing, management, then expansion opportunities. No ladder metaphor by itself; each station is tied to real BMH work. | HeyGen cafe hero later; BMH badge on opener. Remotion draws a simple path line and station icons behind/around Andrea. | `CAREER GROWTH PATH` (starting), `MASTER WHAT'S IN FRONT OF YOU` (master), `READY FOR MORE` (ready), `REAL PATH HERE` (real path) |
| b02_foundation_role | 2a | voice-only | "working leads, qualifying sellers, or building pipelines" / "That's the foundation" | Conveyor-belt transformation scene: a raw lead card enters a simple BMH qualification machine on the left; on the other side it exits as a qualified lead card. | The generated still bakes `RAW LEAD`, `QUALIFICATION`, and `QUALIFIED LEAD` into their objects. Static push-in fallback is allowed. | `FOUNDATION` (foundation) |
| b03_clean_handoffs | 2b | corner-circle | "Master it" / "Understand the sellers" / "Hit your KPIs consistently" / "leads are clean, well-documented, and actually ready" | Clean-file scene: a BMH rep lovingly hugs a folder/lead file like it is precious because the file is complete, clean, and ready for acquisition. Keep it sweet but work-focused; no hearts or ambient doodles. | Generate still after approval; Andrea corner circle bottom-right. Seedance candidate for subtle folder-hug/hold motion. Remotion pops clean-file criteria rows as spoken. | `MASTER IT` (Master), `UNDERSTAND SELLERS` (Understand), `KPIs CONSISTENTLY` (KPIs), `CLEAN FILE` (clean), `READY FOR ACQUISITION` (ready) |
| b04_readiness_checkpoint | 3a | voice-only | "proven you can do that consistently" / "hitting your numbers for 90-plus days" / "CRM spotless" / "leadership qualities" / "you move up" | Readiness gate board: not a clock-based promotion, but a performance checkpoint with numbers, clean CRM, and leadership markers all lighting before the next path station unlocks. | Mostly code over a simple board/desk still. Remotion checks each criterion and slides the path marker forward. | `CONSISTENCY` (consistently), `90+ DAYS` (90-plus), `SPOTLESS CRM` (CRM spotless), `LEADERSHIP` (leadership), `MOVE UP` (move up) |
| b05_complex_leads_mentor | 3b | voice-only | "more complex leads" / "Probate... family dynamics" / "Multi-owner properties" / "financial distress" / "mentoring the newer people" / "more autonomy" | Complex-lead maze: a BMH rep navigates a maze that contains code-rendered challenge labels: `PROBATE`, `MULTI-OWNER`, `DISTRESS`. The maze exit points toward autonomy/mentoring, so the viewer reads "she can find the way through complex leads." | Generate still after approval; Seedance candidate for rep navigating/turning through the maze. Remotion places maze labels as code overlays so no AI text is baked in. | `COMPLEX LEADS` (complex leads), `PROBATE` (Probate), `MULTI-OWNER` (Multi-owner), `DISTRESS` (financial distress), `MENTOR OTHERS` (mentoring), `MORE AUTONOMY` (autonomy) |
| b06_deal_closer_level | 4a | voice-only | "presenting offers, negotiating terms, and closing deals directly" / "full sales cycle" / "signed contract" / "commission on the deals you close" | Conference-stage deal-closer scene: a BMH rep is on stage at a packed conference presenting the sales/deal process to an audience. The presentation content is code-rendered and specifically shows offer, terms, negotiation, signed contract, and full-cycle ownership so it still matches the script. | Generate still after approval; Seedance candidate for subtle stage/speaker/audience energy. Remotion owns all slide text and the offer-to-contract flow on the projection screen. | `PRESENT OFFERS` (presenting offers), `NEGOTIATE TERMS` (negotiating), `FULL SALES CYCLE` (full sales cycle), `SIGNED CONTRACT` (signed contract), `DEALS YOU CLOSE` (deals you close) |
| b07_creative_deal_skill | 4b | hero-cafe | "expectations are higher" / "real negotiation skills" / "Market knowledge" / "structure deals creatively when the straightforward approach doesn't work" | Cafe Andrea speaks directly at the native 1600x900 framing. | Existing HeyGen clip, full frame, no zoom, no push-in, no graphic, no labels. | none |
| b08_management_path | 5 | voice-only | "leadership drive" / "building a team" / "hiring, training, coaching" / "owning the performance of an entire team" / "When they win, you win" | Priya coaching scene: Priya, the BMH rep from the cast board, helps another headset-wearing teammate at a computer. The coaching is active and practical: she points to the screen or guides the rep through the work. | Generate still after approval; use Priya character anchor from cast-board rules. Seedance candidate for subtle coaching/screen-help motion. Remotion overlays the management responsibilities. | `BUILD THE TEAM` (building a team), `HIRING` (hiring), `TRAINING` (training), `COACHING` (coaching), `TEAM OUTPUT` (team's output), `WHEN THEY WIN, YOU WIN` (they win) |
| b09_no_fixed_schedule | 6 | side-full Andrea | "what actually gets you promoted here?" / "It's not time" / "no fixed schedule" / "demonstrated performance and readiness" | Andrea speaks while reading a promotion/readiness scorecard. The visual must feel like she is reading real criteria, not holding a generic paper. The scorecard shows proof replacing calendar time. | HeyGen Andrea clip later; Remotion places code-rendered scorecard text beside/in front of her. Calendar/time imagery is minimized or crossed out in code. | `NOT TIME` (not time), `NO FIXED SCHEDULE` (no fixed schedule), `PERFORMANCE` (performance), `READINESS` (readiness) |
| b10_daily_performance_criteria | 7 | corner-circle | "hitting your numbers consistently" / "Do your calls actually sound good?" / "Is your CRM clean?" / "Every lead has notes, a stage, and a next action" / "No leads sitting there with no plan" | Promotion scorecard close-up: the criteria Andrea is reading become the main visual, with rows for numbers, call quality, clean CRM, notes, stage, next action, and no abandoned lead. | Generate still after approval if a physical scorecard plate is needed; otherwise keep as code. Andrea corner circle optional if the b09 clip does not carry enough presence. Remotion rows pop in sequence. | `HIT NUMBERS` (numbers), `CALLS SOUND GOOD` (calls), `CLEAN CRM` (CRM clean), `NOTES + STAGE + NEXT ACTION` (notes), `NO LEADS WITH NO PLAN` (no plan) |
| b11_team_contribution_coachability | 8 | voice-only | "contribute to the team" / "Share what's working" / "coachable" / "fix it, or do you get defensive" / "hear feedback, apply it, and come back better" | Team contribution scene: one rep shares a working tactic on a team board while another receives a coaching note and improves the process card. Avoid scolding visuals; show feedback turning into better work. | Generate still after approval; Seedance candidate for team-board/feedback motion. Remotion overlays the behavior loop. | `HELP PEOPLE` (help people), `SHARE WHAT'S WORKING` (Share), `COACHABLE` (coachable), `FIX THE GAP` (fix it), `COME BACK BETTER` (better) |
| b12_revenue_opportunity | 9 | voice-only | "Is your work producing revenue?" / "turning into closed deals" / "speaks louder" / "expanding" / "New markets, new teams, new positions" / "How far you go here is up to you" | Revenue-to-opportunity map: productive work turns into closed deals, then expansion markers open new markets, teams, and positions. This is the payoff of the earlier criteria. | Preserve the existing passing layout and static push-in fallback. Remotion highlights revenue, closed deals, new opportunities, and final agency line. | `REVENUE-PRODUCING LEADS` (producing revenue), `CLOSED DEALS` (closed deals), `NEW MARKETS` (New markets), `NEW TEAMS` (new teams), `NEW POSITIONS` (new positions), `UP TO YOU` (up to you) |
| b13_course_close | 10 | hero-cafe split take | Jarrad-approved growth-path topic close in the revision lock above | Calm full-frame cafe Andrea closes the topic without suggesting that training is complete. | Two HeyGen takes split after `the results you produce`; straight cut at the audio seam; low natural hands; no phone, welcome card, labels, or finale props; 18-frame postroll; final fade completes on course blue after narration. | none |

## Planned stills after approval, with detection target

| File | What it must make obvious | Why this belongs in the script |
|---|---|---|
| `m19_L19_b02_foundation-conveyor.png` | Raw lead goes into a machine on a conveyor belt and comes out as qualified lead. | Cue 2 says the foundation is working leads, qualifying sellers, building pipeline, and handing off. |
| `m19_L19_b03_clean-file-hug.png` | A BMH rep loves the folder because it is a clean, complete handoff file. | Cue 2 says acquisition should love getting these handoffs because they are clean and ready. |
| `m19_L19_b05_complex-lead-maze.png` | A BMH rep navigates a maze whose code-rendered labels identify probate, multi-owner, and distress complexity. | Cue 3 defines the first growth step as handling complex leads with more autonomy. |
| `m19_L19_b06_deal-conference.png` | A BMH rep presents the offer-to-signed-contract process on stage to a packed conference. | Cue 4 names the direct closer level and why the earning potential changes. |
| `m19_L19_b08_priya-coaching.png` | Priya helps another headset-wearing rep at a computer, making coaching/team output visible. | Cue 5 ties leadership drive to hiring, training, coaching, and team output. |
| `m19_L19_b10_promotion-scorecard.png` | The scorecard Andrea is reading contains the observable promotion criteria: numbers, calls, clean CRM, notes, stage, next action, no abandoned lead. | Cue 7 lists the day-to-day evidence BMH actually looks at. |
| `m19_L19_b11_team-contribution-coachability.png` | A teammate shares what works, receives feedback, fixes the gap, and comes back better. | Cue 8 defines team contribution and coachability as promotion signals. |
| `m19_L19_b12_revenue-opportunity.png` | Clean handoff leads become closed deals, then closed deals create expansion opportunities. | Cue 9 says revenue-producing leads speak loudest and tie directly to new opportunities. |

## Pure code beats after approval
- b01: clean hero bookend with BMH badge only.
- b04: readiness checkpoint board over a simple still or fully code-rendered board.
- b07: no code visual; full-frame Andrea only.
- b13: no code visual or labels; two-take full-frame Andrea topic close.

## Andrea clips after approval
- b01 cafe Andrea opening, with BMH badge in Remotion.
- b03 optional corner-circle Andrea over clean handoff scene.
- b09 Andrea speaking while reading the promotion/readiness scorecard.
- b10 optional corner-circle Andrea over the scorecard close-up if b09 needs continuity.
- b13 two calm full-frame cafe Andrea takes, no props or gestures above frame.

## Animation candidates after still approval
- b02 foundation role: raw lead card rides conveyor into machine and qualified lead card exits.
- b03 clean handoff: BMH rep lovingly hugs/holds the clean folder.
- b05 complex leads: BMH rep navigates the labeled maze toward the exit.
- b06 deal closure: stage presentation and audience energy while deal-process slide reveals.
- b08 management path: Priya actively coaches headset-wearing teammate at the computer.
- b11 contribution/coachability: feedback card becomes an improved process card.
- b12 revenue opportunity: handoff leads become closed deals, then expansion markers open.

All animation must use Seedance triple-clamp with style refs after approval. If Higgsfield/MCP is unavailable, use static stills with code push-in and flag the fallback.
