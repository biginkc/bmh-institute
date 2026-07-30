# Module 09 - Lesson 9B "Seller FAQ Decoder: Questions 6-10" scene cards — v2 DRILL FORMAT

**Supersedes `module-09-lesson9B-scenecards.md` (v1 doodle-scene draft) per Jarrad's format correction, 2026-07-09:** 9B continues the Lesson 7B live-avatar drill series. Each FAQ question is asked ON CAMERA by a real HeyGen seller avatar (new picks, not the 7B 32-roster — Jarrad's call), then Andrea answers. Park-bench Andrea bookends carry 9A/module-09 continuity (Jarrad-confirmed).

Stage: text storyboard. NO generation of any kind until Jarrad approves this storyboard AND the 5 seller-avatar picks.

## Format spec (from the shipped 7B pipeline — binding)

- **Seller ask beats:** HeyGen public studio avatar, keyed/composited onto canonical blue `#62b3f3` (7B keying recipe), upper-body framing, distinct gender-matched HeyGen voice per seller, alternating M/F across the five questions. The seller SPEAKS the question line verbatim (the quoted line only). **Master deviation to record: the quoted question lines move from Andrea's voice to seller avatars; wording stays verbatim.**
- **Andrea answer beats:** park-bench Andrea avatar (`05fa4c66c4504b929d4d7dd6f679cd4b`) speaking the answer text verbatim — same avatar as the bookends, so the whole lesson is one presence (module-09 continuity; replaces 7B's host framing per Jarrad).
- **Decoder chips:** the 9A top-left `TRUST | FAIR | SIMPLE` chip row appears on answer beats only, driving chip lit per answer (Q6 SIMPLE · Q7 FAIR · Q8 SIMPLE · Q9 SIMPLE · Q10 TRUST). Proposed carry-over from 9A — flag for Jarrad's sign-off.
- **Labels:** bottom-center one-at-a-time queue (rule 3b). Seller ask beats carry a single static `QUESTION 6` … `QUESTION 10` label (bottom-center) while the seller speaks — mirrors 7B's drill labels.
- **MINIMALISM (rule 1d):** seller clips are avatar-on-blue ONLY — no desks, no props, no scene dressing. Andrea beats are the bench scene as shipped. Nothing else enters frame.
- **Audio:** TTS speed 1.0; 1.0s inter-beat gaps; pipeline = 7B scripts (gen TTS lines → 2-clip keying/lip-sync smoke test → batch on pass).
- **Encode:** 1600×900 H.264/AAC yuv420p LIMITED tv-range BT.709.
- **Transitions:** straight cuts between seller-ask and Andrea-answer (same conversational plane — NOT location moves); fades only at true open/close. No mid-lesson slides unless a beat is staged as a real location change (none are).

## Cast — 5 NEW seller avatars (candidates board → Jarrad approval before any clip)

Constraints (7B roster-lock process): HeyGen public studio avatars NOT among the 32 used in 7B; keyable/black-or-clean backdrop; no medical outfits; distinct faces; gender-matched distinct voices; alternating M/F in drill order:
- Q6 repairs — M
- Q7 fees/commissions — F
- Q8 after signing — M
- Q9 leaseback — F
- Q10 change mind — M

Candidate contact sheet to be generated and presented alongside this storyboard.

## Beats

### b01_reentry_bridge — park-bench Andrea (APPROVED wording)
VO (approved new writing, master deviation): "Welcome back. In the last lesson, we decoded the first five seller questions. Now we'll finish the set with questions six through ten, then tie the whole thing back to how you sound on a real call."
Clean opener: BMH badge only, no labels. Fade in (true open). Straight cut to b02.

### b02a/b02b_q6_repairs — seller M asks · Andrea answers
- b02a: Seller 1 (M) on blue: **"Do I need to make any repairs?"** Label: `QUESTION 6`.
- b02b: Park-bench Andrea, verbatim answer (cues 14–15 answer text). Chips: SIMPLE lit. Label queue: `ZERO REPAIRS` ("Zero repairs") → `ANY CONDITION` ("any condition") → `EXACTLY AS IT IS` ("exactly as it is").

### b03a/b03b_q7_fees — seller F asks · Andrea answers
- b03a: Seller 2 (F): **"Are there any fees or commissions?"** Label: `QUESTION 7`.
- b03b: Andrea answer verbatim. Chips: FAIR lit. Queue: `NO FEES` → `NO COMMISSIONS` → `NO CLOSING COSTS` → `WALK-AWAY NUMBER`.

### b04a/b04b_q8_after_signing — seller M asks · Andrea answers
- b04a: Seller 3 (M): **"What happens after I sign?"** Label: `QUESTION 8`.
- b04b: Andrea answer verbatim. Chips: SIMPLE lit. Queue: `TRANSACTION TEAM TAKES IT` ("transaction team") → `TITLE · INSPECTIONS · CLOSING` ("closing logistics") → `MONEY SAME DAY OR NEXT` ("same day or the day after").

### b05a/b05b_q9_leaseback — seller F asks · Andrea answers
- b05a: Seller 4 (F): **"Can I stay in the house after selling?"** Label: `QUESTION 9`.
- b05b: Andrea answer verbatim. Chips: SIMPLE lit. Queue: `SOMETHING WE CAN DISCUSS` → `LEASEBACK` → `ACQUISITION WORKS OUT DETAILS`.

### b06a/b06b_q10_change_mind — seller M asks · Andrea answers
- b06a: Seller 5 (M): **"What if I change my mind?"** Label: `QUESTION 10`.
- b06b: Andrea answer verbatim. Chips: TRUST lit. Queue: `INSPECTION PERIOD BUILT IN` → `NOT FINAL UNTIL COMFORTABLE` → `REDUCE THE FEAR`.

### b07_not_performing — park-bench Andrea
Verbatim cue 24 ("you're not performing…"). Chips: all three lit together on "handle any question" (recap moment). Queue: `NOT PERFORMING` → `REAL PERSON` → `CLEARLY AND HONESTLY`.

### b08_practice — park-bench Andrea + minimal Remotion tiles
Verbatim cue 25. Four small code-rendered tiles pop word-timed beside/above the label zone: `CAR` · `HOME` · `MIRROR` · `LIVE CALL`, settling into a row (object text). Queue: `SAY IT OUT LOUD` → `DON'T HESITATE`. No generated still needed — Remotion only (minimalism).

### b09_outro — park-bench Andrea (MASTER VERBATIM)
"All right. Next up: the follow-up game — where most of the money actually gets made."
Queue: `NEXT: FOLLOW-UP GAME` ("follow-up game"). Fade out (true close).

## Master deviations to record on approval
1. b01 re-entry bridge (new writing, approved 2026-07-09).
2. Question lines voiced by seller avatars instead of Andrea (text verbatim).

## Pipeline after Jarrad approves storyboard + avatar picks
7B scripts reused: TTS lines (5 seller + Andrea beats) → 2-clip keying/lip-sync smoke test → Jarrad spot-check → batch remaining → assemble → LESSON-9B-v1.mp4 (immutable) → Claude QC (incl. 7B-frame continuity diff + minimalism FAIL class) → Jarrad watch.
