# Module 11 - Lesson 11A "Closing & Deal Engineering" scene cards (2026-07-08)

Script: `lesson-11A-script-clean.txt` (locked master Slot 15, `Chapter 10 - FINAL.srt`, cues 1-11, verbatim). Format follows `scene-card-v2.md` with later guide/playbook overrides: Andrea voice speed stayed `1.0`; transient teaching text is code-rendered via `Sticker`; no text is baked into generated stills except the requested object words `ACQUISITION`, `OFFER`, and `Transaction Coordinator` where they render cleanly.

**Final status:** ✅ **APPROVED & FINAL** by Jarrad on 2026-07-08. Final cut: `course-assets/review-lesson11A/LESSON-11A-v2.mp4` (5:29.7, 16 beats, 1600x900 H.264/AAC, yuv420p limited BT.709, loudness -17.2 LUFS). v2 supersedes v1 after the Remotion label/transition rule update: one bottom-center transient label at a time, and Lesson 1A camera-travel slide transitions. The first new 11A Andrea table photo-avatar remains rejected because the mouth/teeth looked scary; final render uses the approved Lesson 9A park-bench Andrea avatar.

## Source cleanup
- SRT cue numbers, timestamps, blank lines, and code fences stripped.
- No stage directions were present.
- Andrea narrator wording is unchanged.
- Diff artifact: `lesson-11A-source-clean-vs-master.diff`.
- Master deviations: **none**. The closing line stays "On to the next section." The storyboard maps that meaning to Slot 16, **KPIs & Sales Telemetry**, as an on-screen next-section tease only.

## Scope call
This is one cohesive lesson. It moves from closing mindset, to acquisition-team offer mechanics, to negotiation, contract/transaction handoff, fall-apart risks, and the learner's impact. No A/B split.

## Cast and visual rules
- **2026-07-07 still-gate correction:** the first image pass was rejected for style and character drift. Do not improvise from generic "course doodle" memory. Every regenerated still must use `codex exec` gpt-image-2 with `docs/design/style-ref-1.png`, `docs/design/style-ref-2.png`, `docs/design/cast-board.png`, and `docs/design/object-board.png` attached.
- Narrator = Andrea: **park-bench Andrea** from Lesson 9A (`course-assets/scenes/module-09/m09_L9A_bench_andrea.png`; HeyGen avatar stored in `course-assets/heygen/lesson9A/_avatars.json`). Andrea is the company/narrator avatar only; do not use Andrea as the seller/homeowner or as the BMH rep. Opening beat carries `<BmhBadge/>` lower-right.
- Scene beats use generated full-frame doodle stills with Seedance animation where approved.
- Remotion owns word-timed Sticker text, transitions, and any precise labels that fail in generation. **No code-first primary beats remain in this storyboard.**
- Requested simple in-scene words are allowed where they are the object being illustrated: `ACQUISITION` on b05 shirts, `OFFER` on b07 sheet, and `Transaction Coordinator` on b11 door. If generated text is garbled, reroll once; if still unreliable, keep the image clean and add the label as a Remotion overlay.
- Avoid repeated seller identity drift. If a human seller appears across multiple stills after approval, create an anchor crop from the first approved still and reuse it.
- Confirmed rep/seller refs for b09 and any later rep/seller scenes: `docs/design/cast-board.png`, `docs/design/object-board.png`, `course-assets/scenes/module-04-lesson4B/m04_L4B_v4b_offer_handoff_animated_base.png`, `course-assets/scenes/module-04-lesson4B/m04_L4B_v5_rep_closeup_headset.png`, and `course-assets/scenes/module-05-lesson5B/_anchors/seller.png`. Character lock: Priya/BMH rep = headset woman with black back ponytail, orange/yellow headband, orange headset with boom mic, yellow top, cream pants; seller = curly black-haired man, orange sweater, cream pants, tiny centered two-stroke/comma nose.
- Final transitions: Lesson 1A directional slide/camera-travel between teaching beats; no mid-lesson fade. Fade only if a true separate open/close/end-card moment is explicitly added in a future revision.
- Remotion teaching labels use the v2 single-label rule: bottom-center by default, one visible at a time, replaced by the next trigger. Non-bottom overlays are only for documented prop/diagram purposes.

## Animation consistency lock
- **2026-07-07 motion correction:** do not improvise animation style. Lesson 11A motion must match the approved 4B/6A/7A course motion family, not generic AI video motion.
- Animation started only after Jarrad approved stills and explicitly opened the animation stage. Final approved scene animations live under `course-assets/heygen/lesson11A/seedance/`.
- Default model is `seedance_2_0`; no bakeoff and no Kling unless Jarrad asks for one. Kling's overactive mouth motion is a known rejection.
- Attach the same visual references every time: `docs/design/style-ref-1.png`, `docs/design/style-ref-2.png`, `docs/design/cast-board.png`, `docs/design/object-board.png`, plus the approved still/start image for the beat and any approved character anchor needed for Priya or seller.
- Prompt spine: flat sticker-sheet doodle illustration; thick black hand-drawn outlines with slight wobble; rounded simple forms; flat fills only; no gradients, texture, shadows, lighting, perspective, or skin-tone shading; tiny dot eyes; tiny centered two-stroke/comma nose; cylindrical limbs; strong simple silhouettes; no text.
- Motion spine: **one single continuous shot**, no cuts, no scene changes, no reference sheets appearing, no new props, no extra people, no duplicate characters, no prop morphing, no face/nose drift. Keep actions small and readable.
- Use still/static treatment instead of animation when the desired action is too subtle for Seedance to perform reliably. An unconvincing animated action is worse than a clean still with Remotion push-in.
- Do not loop long beats. Generate adjacent shots if more coverage is needed. At assembly, hold the AI clip's own extracted final frame for any tail, never the source still and never a forward/reverse loop.
- Do not self-approve motion quality or say it matches. For any future revision, show the affected clip(s) to Jarrad as the gate owner before reassembly.

## Approved storyboard reset (2026-07-07)
These are the approved still directions used for the final cut. The goal was to make every image trace directly to a spoken script moment, keep Andrea/Priya/seller roles distinct, and avoid abstract code-first visuals as the primary communication.

| Approved image | Script context it serves | Final image direction | Hard locks / avoid |
|---|---|---|---|
| `m11_L11A_andrea-bench.png` | Cue 1: "reframe how you think about closing" / "closing should actually be the easiest part." Also cue 11 close. | Approved Lesson 9A park-bench Andrea, narrator only, addressing the learner. This replaces the rejected 11A table Andrea avatar. | Andrea is not Priya and not the seller. No headset-rep ponytail. No baked text. BMH badge added later in Remotion. |
| `m11_L11A_b02_formal-agreement.png` | Cue 2: seller already likes, trusts, and wants to do business; "formal agreement that makes it official." | Seller and Priya standing next to each other with arms around each other, friendly and trust-based. The close feels like the relationship is already there. | No Lesha/new third character. No money pile, no victory pose, no readable contract text. |
| `m11_L11A_b03_handoff-role.png` | Cue 3: "you're not the person presenting the offer" / "delivered a qualified, motivated, well-documented lead." | Priya hands a blank lead packet to an acquisition teammate who also wears a headset. The seller is not in this frame, because this is the handoff to acquisition. | Acquisition teammate must have a headset. Do not show Priya negotiating. No seller, no price, no Andrea-as-rep confusion. |
| `m11_L11A_b04_why-understand.png` | Cue 3: understand closing to help follow-ups, improve discovery, and grow toward acquisition responsibilities. | Priya talking on the phone at her call desk with subtle phone-talking animation. | No code-card scene. No floating icons/cards. No Andrea. |
| `m11_L11A_b05_offer-range.png` | Cue 4: acquisition reviews notes, property data, comparable sales, and generates an offer range. | A team of acquisition folks with headsets and t-shirts that say `ACQUISITION`; one teammate becomes the consistent acquisition-team character reused in b06. | Keep shirts simple and readable if possible; if text garbles, reroll or overlay. No seller in this frame. |
| `m11_L11A_b06_clean-offer.png` | Cue 4: contact seller and present a clean, simple offer: cash, timeline, paperwork, no repairs/fees. | Split phone call: the consistent acquisition teammate from b05 on one side, locked seller on the other side. | Acquisition character must visibly match one person from b05. No baked `$X`, no pressure/gimmick imagery. |
| `m11_L11A_b07_hoping-more.png` | Cue 5: "I was hoping for more" is normal, expected, not a dealbreaker. | Seller reviews an offer sheet that clearly says `OFFER`, calm/thoughtful expression. | The sheet should say `OFFER`. No panic, no anger, no exaggerated disappointment. |
| `m11_L11A_b08_close-gap.png` | Cue 5: acknowledge, reframe value, ask what works, figure out if the gap can close. | Park-bench Andrea/narrator talking directly. This beat returns to narrator explanation instead of a negotiation diagram. | Andrea only. No Priya/seller/acquisition-team scene. No code-first diagram. |
| `m11_L11A_b09_arm-wrestling-respect.png` | Cue 6: "it's not about winning" / both sides need to feel good and respected. | Priya/BMH rep and the locked seller in a friendly arm-wrestling setup at a table. It is the wrong "winning" frame that the narration rejects. | Priya = ponytail/headset/yellow top/cream pants. Seller = curly black-haired man/orange sweater/cream pants. No aggression, no spectators, no face/nose drift. |
| `m11_L11A_b10_contract-signed.png` | Cue 7: verbal agreement, terms confirmed, purchase agreement sent, seller reviews and signs electronically. | Seller calmly reviews/signs a blank agreement on a tablet at a kitchen table while the acquisition call is implied by a grounded phone nearby. | No readable legal text, no signature text, no process-row diagram as the main image. |
| `m11_L11A_b11_transaction-work.png` | Cue 7: title verifies ownership, checks liens, inspection/logistics, coordinator manages closing. | Office door that says `Transaction Coordinator`; the visual clearly introduces the transaction coordinator function. | If the long door label garbles, use a clean overlay. Operational office context only, no floating icon montage. |
| `m11_L11A_b12_sellers-remorse.png` | Cue 8: seller second-guesses because they did not feel heard; discovery and rapport prevent this. | Seller crying after signing to clearly indicate remorse. | Keep the seller identity locked. Emotional but not chaotic or horror/drama. |
| `m11_L11A_b13_deal-risks.png` | Cue 9: family interference can derail the deal. | Seller surrounded by family with shrugged shoulders, showing confusion/interference. | Focus on family interference. No title/higher-offer montage here. No scary clutter. |
| `m11_L11A_b14_trust-beats-price.png` | Cue 9: if relationship is genuine, seller often sticks even when a competitor offers more; trust beats price. | Return to seller and Priya standing next to each other with arms around each other, trust-based. | No competitor character needed. No money worship or dollar numbers. |
| `m11_L11A_b15_your-impact.png` | Cue 10: "you're the person who made the deal possible" / discovery, empathy, consistency / started with a conversation. | Park-bench Andrea speaking directly again. | Andrea only. No Priya/learner scene. |

## Storyboard

| Beat | Cue | Andrea mode | Transcript context | Visual idea | Motion / assembly plan | Text via Sticker (trigger) |
|---|---|---|---|---|---|---|
| b01_reframe_close | 1 | hero-park-bench Andrea + BMH badge | "reframe how you think about closing" / "closing should actually be the easiest part" | Approved park-bench Andrea direct-address opener; no extra people, no readable text in the still. | HeyGen park-bench avatar hero clip. Fade in only at open. | `CLOSING SHOULD BE THE EASIEST PART` (easiest) |
| b02_formal_agreement | 2 | voice-only | "someone they like... trust... want to do business with" / "formal agreement that makes it official" | Seller and Priya standing next to each other with arms around each other; the relationship/trust is already built before the paperwork. | Generated still plus approved Seedance tiny friendly posture shift. Centered composition. | `FORMAL AGREEMENT` (official) |
| b03_handoff_role | 3a | voice-only | "you're not the person presenting the offer" / "you delivered a qualified, motivated, well-documented lead" | Priya hands a blank lead packet to an acquisition teammate who also wears a headset. | Generated still with Seedance handoff gesture. | `HANDOFF` (handoff) |
| b04_why_understand | 3b | voice-only | "help with follow-ups during the offer stage" / "better at discovery" / "grow in your career" | Priya talking on the phone at her call desk, visually tying closing knowledge back to follow-up and discovery work. | Generated still plus approved subtle phone-talking animation. | `SUPPORT` (follow-ups), `DISCOVERY` (discovery), `GROWTH` (grow) |
| b05_offer_range | 4a | voice-only | "reviews your notes and the property data" / "comparable sales" / "generate an offer range" | Team of acquisition folks with headsets and t-shirts that say `ACQUISITION`; one teammate becomes the anchor for b06. | Generated still plus approved subtle team idle. | `OFFER RANGE` (range) |
| b06_clean_offer | 4b | voice-only | "clean and simple" / "$X in cash" / "No pressure. No gimmicks. Just a clear, honest offer." | Split phone call: consistent acquisition teammate from b05 on one side, locked seller on the other. | Generated still; all `$X`/offer details rendered in code if needed. | `CLEAR HONEST OFFER` (honest) |
| b07_hoping_more | 5a | voice-only | `"I was hoping for more." That's normal. Expected. Not a dealbreaker.` | Seller calmly reviewing an offer sheet that says `OFFER`. | Generated still plus approved seller reaction animation. | `NOT A DEALBREAKER` (dealbreaker) |
| b08_close_gap | 5b | hero-park-bench Andrea | "acknowledging" / "reframe the value" / "ask what works" / "gap they can close" | Park-bench Andrea talking directly while explaining the negotiation framework. | HeyGen park-bench avatar narrator clip. | `ACKNOWLEDGE` (acknowledging), `REFRAME` (reframe), `ASK` (ask), `CLOSE THE GAP` (gap) |
| b09_respect | 6 | voice-only | "it's not about winning" / "both sides can feel good" / "both parties need to feel respected" | Full-frame generated scene: Priya/BMH rep with black ponytail and orange headset arm-wrestles the locked seller at a table. It intentionally shows the wrong "winning" frame so the voice can reject it. Keep it friendly/teaching, not aggressive; no extra people, no face drift, no skin tones, no new outfits, no baked text. | Generated still plus approved subtle table-tension animation, not a victory slam. | `NOT ABOUT WINNING` (winning), `BOTH SIDES FEEL RESPECTED` (respected) |
| b10_contract_signed | 7a | voice-only | "seller agrees verbally" / "purchase agreement gets prepared and sent" / "seller reviews and signs" | Seller calmly reviewing/signing an agreement. | Generated still; precise legal/process labels rendered in code only if needed. | `VERBAL YES` (verbally), `PURCHASE AGREEMENT` (purchase), `E-SIGN` (electronically) |
| b11_transaction_work | 7b | voice-only | "title company verifies ownership, checks for liens" / "closing logistics get coordinated" | Office door that says `Transaction Coordinator`, introducing the team that manages the post-contract work. | Generated still; use a positioned overlay only if the long door text garbles. | `CLOSING LOGISTICS` (logistics) |
| b12_sellers_remorse | 8 | voice-only | "Seller's remorse" / "seller didn't feel heard" / "good discovery and genuine rapport" | Seller crying after signing to clearly indicate remorse. | Generated still; static or very subtle posture motion only. | `SELLER'S REMORSE` (remorse), `FEEL HEARD` (heard) |
| b13_deal_risks | 9a | voice-only | "Family interference" / "A relative finds out about the deal and talks the seller into backing out" | Seller surrounded by family with shrugged shoulders, showing family interference and confusion. | Generated still; static or slight family reaction motion only. | `FAMILY INTERFERENCE` (family) |
| b14_trust_beats_price | 9b | voice-only | "they often stick with you even when a competitor offers more" / "Trust beats price" | Seller and Priya standing next to each other with arms around each other, returning to the trust image. | Generated still plus approved trust-beat animation reuse. | `TRUST BEATS PRICE` (trust) |
| b15_your_impact | 10 | hero-park-bench Andrea | "you're the person who made the deal possible" / "Your discovery... empathy... consistency" / "it started with a conversation you had" | Park-bench Andrea speaking directly again about the learner's impact. | HeyGen park-bench avatar narrator clip. | `YOU MADE THE DEAL POSSIBLE` (possible) |
| b16_next_kpis | 11 | hero-park-bench Andrea | "That's the real impact..." / "On to the next section." | Park-bench Andrea close. Small next-section card teases Slot 16 KPIs without changing the spoken line. | HeyGen park-bench avatar hero clip. | `NEXT: KPIs & SALES TELEMETRY` (next section) |

## Approved stills used
- `m11_L11A_andrea-bench.png` - approved Lesson 9A park-bench Andrea source still for all Lesson 11A Andrea appearances; this replaces the rejected table Andrea avatar.
- `m11_L11A_b02_formal-agreement.png` - seller and Priya standing next to each other with arms around each other; relationship/trust already built.
- `m11_L11A_b03_handoff-role.png` - Priya hands a qualified, motivated, documented lead packet to a headset-wearing acquisition teammate.
- `m11_L11A_b04_why-understand.png` - Priya talking on the phone at her call desk.
- `m11_L11A_b05_offer-range.png` - acquisition team with headsets and shirts that say `ACQUISITION`.
- `m11_L11A_b06_clean-offer.png` - split phone call between the consistent b05 acquisition teammate and locked seller.
- `m11_L11A_b07_hoping-more.png` - seller calmly reviewing an offer sheet that says `OFFER`.
- `m11_L11A_b08_close-gap.png` - park-bench Andrea/narrator speaking directly while explaining the acknowledge/reframe/ask/close-gap framework.
- `m11_L11A_b09_arm-wrestling-respect.png` - Priya/BMH rep and locked seller arm wrestling as the wrong "winning" frame; friendly contrast for respect-based negotiation.
- `m11_L11A_b10_contract-signed.png` - seller calmly reviewing/signing the agreement.
- `m11_L11A_b11_transaction-work.png` - office door labeled `Transaction Coordinator`.
- `m11_L11A_b12_sellers-remorse.png` - seller crying after signing; remorse is clear.
- `m11_L11A_b13_deal-risks.png` - seller surrounded by family with shrugged shoulders.
- `m11_L11A_b14_trust-beats-price.png` - seller and Priya standing next to each other with arms around each other.
- `m11_L11A_b15_andrea-impact.png` - park-bench Andrea speaking directly again about the learner's impact.

## Pure code beats in final cut
- None as primary visuals in this storyboard. Remotion still owns precise Sticker text, transitions, and any fallback labels for generated text that garbles.

## Andrea clips used
- b01 park-bench Andrea opening, with BMH badge.
- b08 park-bench Andrea direct narrator beat.
- b15 park-bench Andrea direct narrator beat.
- b16 park-bench Andrea closing.

## Animation plan used for final v2
- b02 formal agreement: tiny friendly posture shift only; no new characters, no mouth performance.
- b03 handoff role: one readable folder handoff gesture only; no Andrea overlay in this final beat.
- b04 why understand: subtle Priya phone-talking motion only; no large gestures.
- b05 offer range: very small acquisition-team idle only; preserve the selected b06 character.
- b06 clean offer: gentle split-call posture; preserve the b05 acquisition teammate. If phone intent reads awkwardly, keep static.
- b07 hoping for more: seller calm reaction only; no distress, no exaggerated acting.
- b08 close gap: park-bench Andrea HeyGen/direct narrator only, no Seedance scene animation.
- b09 arm wrestling: subtle table tension only; no victory slam, no aggressive facial expressions, no clone or extra spectators, no character drift from Priya/seller refs.
- b12 sellers remorse: subtle crying/remorse posture only; no dramatic panic or face drift.
- b13 deal risks: slight family shrug/reaction only; no extra new family members appearing mid-clip.
- b14 trust beats price: animate only if Priya/seller identity stays locked; otherwise keep static.
- b15 impact: park-bench Andrea HeyGen/direct narrator only, no Seedance scene animation.

If this lesson is ever reopened and Higgsfield/MCP is unavailable, use static stills with code push-in and flag the fallback. Do not block indefinitely.
