# ⛔ WITHDRAWN (2026-07-09) — DO NOT PRODUCE FROM THIS FILE
# Jarrad content decision 2026-07-07: fixed compensation numbers (tiers/bonuses/commission mechanics)
# may NOT appear in any training content — plans vary by role and change over time.
# This storyboard follows the old fixed-comp Slot 17 master and is superseded by the GENERIC
# compensation lesson: script `lesson-17-script-clean.txt` (v2 generic) + Lesson 17 render line.
# Kept for history only. Any future tab: resume from Lesson 17, never from here.

# Module 13 - Lesson 13A "Compensation Engine" scene cards (2026-07-07)

Script: `lesson-13A-script-clean.txt` (locked master Slot 17, `Chapter 12 - FINAL.srt`, cues 1-13, verbatim). Format follows `scene-card-v2.md` with later guide/playbook overrides: Andrea voice speed stays `1.0`; all text is code-rendered via `Sticker`; no text is baked into generated stills.

**Gate:** text storyboard only. Generate no audio, stills, avatar clips, animations, or render until Jarrad approves this storyboard.

## Source cleanup
- SRT cue numbers, timestamps, blank lines, and code fences stripped.
- No stage directions were present.
- Andrea narrator wording is unchanged.
- Diff artifact: `lesson-13A-source-clean-vs-master.diff`.
- Master deviations: **none**. The closing meaning is preserved verbatim: this tees up Slot 18, Operator Playbook / the real day workflow.

## Scope call
This is one cohesive lesson. I do **not** recommend an A/B split because the compensation structure builds in one sequence: base/ramp -> commissions -> appointment bonus -> worked examples -> attribution -> daily behaviors -> next-slot real-day workflow.

## Cast and visual rules
- Narrator = Andrea: cafe hero bookends (`b2cd0545...`) on b01 and b13. Opening beat carries `<BmhBadge/>` lower-right.
- Compensation visuals are primarily code-rendered tiers, counters, bonus math, payout examples, ledgers, and attribution timelines.
- Generated stills are reserved for human/context beats: race-podium winner metaphor, top-performer awards wall, and comedic chase warning.
- Remotion owns all dollar amounts, tier labels, formulas, counters, thresholds, and next-lesson cards.
- Do not generate or bake text into stills. Every number and label appears later via `Sticker`/code overlays.
- Seedance only animates approved illustrated scene beats later; pure math/dashboard beats stay code-driven.
- Transitions later: slide/camera-travel between teaching beats; fade only into b01 and out of b13.

## Storyboard

| Beat | Cue | Andrea mode | Transcript context | Visual idea | Motion / assembly plan | Text via Sticker/code (trigger) |
|---|---|---|---|---|---|---|
| b01_money_connection | 1 | hero-cafe + BMH badge | "let's talk about money" / "how your performance turns into a paycheck" / "connection between your daily work and what you earn" | Cafe Andrea opener on cornflower blue. A code-rendered line draws from a daily-work icon cluster to a paycheck card as she frames the lesson. | HeyGen cafe hero later; BMH badge on opener; code pay-line appears behind/alongside Andrea. | `PERFORMANCE -> PAYCHECK` (performance), `NO MYSTERY` (mystery) |
| b02_three_pieces | 2 | voice-only | "three pieces to your compensation" / "Base pay" / "commissions" / "bonuses" | Pure code three-part compensation engine: three large white cards lock together into one machine. No generated still. | Remotion cards spring in one at a time, then connect with thin black lines. | `3 PIECES` (three), `BASE PAY` (Base), `COMMISSIONS` (commissions), `BONUSES` (bonuses) |
| b03_ramp_to_commission | 3 | voice-only | "hourly base rate while you're ramping up" / "pipeline is still developing" / "KPIs for 30 or more consecutive days" / "graduate to the full commission structure" | Code ramp/bridge: base-pay safety pad on the left, 30-day KPI streak counter in the middle, full commission structure gate on the right. | Remotion ramp line fills over 30 tick marks; gate opens on "transition point." | `RAMP PERIOD` (ramping), `30+ KPI DAYS` (30), `FULL COMMISSION` (full commission), `TRANSITION POINT` (transition) |
| b04_your_deal | 4 | voice-only | "person who sourced and qualified the lead" / "follow-up" / "relationship" / "clean, complete package" / "acquisition team closed it" / "That's your deal" | Doodle still: BMH rep with headset stands proudly on the tallest winner podium after the race, wearing several gold medals around her neck. Two cast-board-inspired competitors stand on shorter second- and third-place platforms, disappointed by posture and tiny downturned mouths. No baked numbers or names. | Generate still after approval; Seedance candidate for subtle proud winner idle. Remotion owns podium labels and deal/pipeline callouts. | `THAT'S YOUR DEAL` (your deal), `WINNING DEAL` (closed), `1ST / 2ND / 3RD` later in code only |
| b05_commission_tiers | 5 | voice-only | "one or two deals" / "$500 per deal" / "Three or four" / "$750 per deal" / "Five or more" / "$1,000 per deal" / "all your deals for the month pay at the highest tier you reached" | Pure code tier ladder with three deal-count bands. The active tier climbs from 1-2 to 3-4 to 5+, then rewrites all five deal chips at the top tier. | Remotion ladder/counters. Deal chips animate upward; final formula shows 5 x $1,000 = $5,000. | `TIER 1: $500` (one or two), `TIER 2: $750` (Three), `TIER 3: $1,000` (Five), `HIGHEST TIER PAYS ALL DEALS` (highest tier), `5 x $1,000 = $5,000` (five grand) |
| b06_appointment_bonus | 6 | voice-only | "Every 25 qualified appointments" / "$250 bonus" / "seller actually shows up" / "Not when you schedule it" / "50 kept appointments" / "$500" | Pure code kept-appointment milestone track. Scheduled appointments stay gray; showed appointments turn into checked chips; every 25 checked chips releases a $250 bonus badge. | Remotion counter and milestone track. The "schedule" chip does not count; "show" chip does. | `KEPT APPOINTMENTS COUNT` (actually shows), `25 KEPT = $250` (25), `50 KEPT = $500` (50) |
| b07_example_tier_two | 7 | voice-only | "30 kept appointments" / "3 deals that closed" / "Tier 2" / "$750 per deal" / "$2,250 in commissions" / "Total bonus and commission... $2,500" | Pure code worked example board. Left column inputs: 30 kept appointments + 3 closed deals. Right column math: appointment bonus + Tier 2 commissions = total above base. | Remotion calculator board with row-by-row reveal; base remains a separate gray placeholder because master says rate varies. | `30 KEPT APPTS` (30), `3 CLOSED DEALS` (3 deals), `3 x $750 = $2,250` ($2,250), `$250 + $2,250 = $2,500` ($2,500) |
| b08_example_tier_three | 8 | voice-only | "40 appointments" / "5 deals" / "one bonus" / "Tier 3" / "$5,000 in commissions" / "$5,250" / "if you reach 50 appointments" | Pure code improvement board. The same calculator steps up: 40 appointments / 5 deals, Tier 3 active, 50-appointment bonus threshold visible but not filled yet. | Remotion before/after comparison from b07 to b08; optional +$250 chip appears at the 50 threshold. | `40 APPTS + 5 DEALS` (40), `TIER 3` (Tier 3), `5 x $1,000 = $5,000` ($5,000), `TOTAL: $5,250` ($5,250), `50 APPTS = +$250` (50) |
| b09_direct_math_no_cap | 9 | voice-only | "The math is direct" / "better you get at follow-up and qualification" / "more you make" / "no cap on commissions" | Pure code performance-to-pay curve. Follow-up and qualification sliders push a commission line upward through an open top border. | Remotion curve and sliders; the ceiling line lifts away on "no cap." | `THE MATH IS DIRECT` (direct), `FOLLOW-UP + QUALIFICATION` (follow-up), `NO CAP` (no cap) |
| b10_attribution_pipeline | 10 | hero-solo / Andrea digital-avatar | "worked the lead" / "completed the handoff" / "signed contract and completed transaction" / "three months ago finally closes" / "pipeline stays with you" | Andrea digital-avatar speaking beat on cornflower blue, with simple code-rendered attribution/timeline labels around her. No generated still. | HeyGen/Andrea avatar later; Remotion owns the attribution timeline, 3-month marker, and credit-stays labels. No Seedance. | `CREDIT STAYS WITH YOU` (still get credit), `WORKED -> HANDOFF -> CLOSED` (worked), `3 MONTHS LATER` (three months) |
| b11_what_top_earners_do | 11 | voice-only | "thorough, consistent" / "don't let good leads die from neglect" / "quality conversations" / "consistent follow-up" / "clean handoffs" / "acquisition team can close efficiently" | Doodle still: BMH rep with headset stands proudly in front of a wall of actual award plaques: shield plaques, framed certificate plaques, and ribbon-top plaques. Latest Jarrad override: plaques may bake the exact phrase "EMPLOYEE OF THE MONTH" so they read as awards, not random squares. | Generate still after approval; Seedance candidate for subtle proud stance only; no extra characters or ambient marks. | `THOROUGH` (thorough), `CONSISTENT` (consistent), `CLEAN HANDOFFS` (clean handoffs) |
| b12_money_on_table | 12 | voice-only | "Every lead you let slip" / "potential commission you left on the table" / "Every thorough handoff" / "money you're putting in your own pocket" / "It's that direct" | Doodle still: comedic cautionary image of the BMH rep chasing a frightened seller, but faces must stay cast-board consistent: tiny dot eyes, centered two-stroke nose, tiny simple mouth. Emotion should come from posture, not off-brand eye/mouth shapes. | Generate still after approval; likely static or very subtle Seedance chase motion. Remotion adds the warning/commission labels. | `LEFT ON THE TABLE` (left on the table), `DON'T LET LEADS SLIP` (let slip), `IT'S THAT DIRECT` (direct) |
| b13_operator_playbook_tease | 13 | hero-cafe | "what a real day actually looks like here" / "how you run your day" / "team stays in sync" / "where you can go from here" | Cafe Andrea close on cornflower blue. Code-rendered next-slot card tees up Operator Playbook / real-day workflow. | HeyGen cafe hero later; fade out only at close. | `NEXT: OPERATOR PLAYBOOK` (next up), `REAL DAY WORKFLOW` (real day), `RUN YOUR DAY + STAY IN SYNC` (stays in sync) |

## Planned stills after approval
- `m13_L13A_b04_your-deal.png` - winner podium metaphor: headset rep on first-place platform with gold medals; disappointed second/third-place cast-board-inspired competitors on shorter platforms; podium labels code-rendered later.
- `m13_L13A_b11_top-earners.png` - proud headset rep in front of a wall of real-looking award plaques that say "EMPLOYEE OF THE MONTH" per latest Jarrad override.
- `m13_L13A_b12_money-table.png` - comedic chase scene: determined rep chasing frightened seller with cast-board-consistent dot eyes and tiny mouths; no violence.

## Pure code beats after approval
- b02: three-part compensation engine.
- b03: ramp-to-commission bridge with 30-day KPI streak.
- b05: commission tier ladder and all-deals-at-highest-tier rule.
- b06: kept-appointment bonus milestone track.
- b07: Tier 2 worked payout example.
- b08: Tier 3 worked payout example plus optional 50-appointment threshold.
- b09: performance-to-pay curve with no-cap ceiling.
- b10: Andrea digital-avatar attribution timeline labels; no generated still.

## Andrea clips after approval
- b01 cafe Andrea opening, with BMH badge.
- b10 Andrea digital-avatar speaking beat for attribution/pipeline-stays-with-you.
- b13 cafe Andrea closing.

## Animation candidates after still approval
- b04 winner podium: subtle proud winner idle; keep medal/podium composition stable.
- b11 awards wall: subtle proud stance only; avoid extra characters, ambient marks, or readable plaque text.
- b12 chase warning: subtle chase motion only if it stays cartoon-safe and readable; still fallback is acceptable.

All animation must use Seedance triple-clamp with style refs after approval. If Higgsfield/MCP is unavailable, use static stills with code push-in and flag the fallback.
