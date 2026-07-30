# Research — how to actually build the animated doodle videos (2026-07-03)

Four parallel research agents. Bottom line: the "HeyGen avatar + Higgsfield-animated backgrounds" plan shifts — **Higgsfield (and AI img2video generally) is the wrong tool to animate flat doodle art.** Animate flat art with **code (Remotion) or vector (Rive)**; keep HeyGen for Andrea; transitions are cheap.

## 1. Andrea (doodle presenter) via HeyGen — QUALIFIED YES
- HeyGen **Avatar IV** animates cartoon/illustrated faces (not the old Talking Photo). Full-face motion.
- **Weak zone:** HeyGen's own docs require "readable eyes, nose, mouth" + "human proportions." A dot-eyes/minimal-mouth doodle is the documented edge case → risk of mushy/distorted lip-sync.
- **De-risk:** give Andrea a *defined mouth shape* (not a dot); run a **1-credit Avatar IV test on the real art**.
- **Fallback if it mushes:** Reallusion **Cartoon Animator 5** — rig the mouth with your own drawn shapes, auto lip-sync from audio; stays perfectly on-brand.

## 2. Scene animation — NOT img2video
- AI img2video (Higgsfield/Runway/Kling/Veo) = raster/photoreal, drifts to 3D, no clean vector, unreliable on-screen text. **Fights flat doodle.** Higgsfield is a *cinematic* tool (dolly/bullet-time); no evidence it holds a flat 2D look; clips only 3–5s.
- **Pros animate flat explainers with:** After Effects (+Lottie) · **Rive** (Duolingo/Spotify; visual editor; loose character wiggle) · **Remotion** (code-as-video).
- **Best fit for a solo coder doing 19 modules → Remotion + Claude Code.** Build one flat template, render all 19 from data; total control of flatness/text/consistency/transitions. Pairs with our "every object is a sticker, animation-friendly" style rule → generate **individual sticker elements (transparent PNGs)** and animate them in code.
- Cartoon-tuned img2video alternatives if we ever want them: Artificial Studio / Minimax-Live, ImagineArt "2D Flat" mode, Viggle. Better than Higgsfield for flat, but less control than code.

## 3. Transitions — cheap, solved
- Techniques: shape/mask reveal, **shape morph**, **element continuity / match-cut** (highest value — it's *composition*, bake into the shot list), whip pan, liquid wipes, kinetic type.
- Solo path: **DaVinci Resolve (free)** or CapCut + a **preset pack** (Motion Bro ~$55 lifetime / AEJuice) → ~90% polish, ~$50, an afternoon.
- 2–3 hero morphs: AI generative transition (Higgsfield morph fits *here*). In Remotion, transitions are just code.

## 4. Assembly / compositing
- HeyGen has **native background removal** (all paid plans) → export Andrea as a **transparent cutout**, layer over the animated scene.
- Editor path: CapCut / Premiere / DaVinci, Andrea as transparent top layer. Code path: Remotion IS the assembly (composites Andrea + scenes + transitions + renders the module).

## Recommended pipeline
**Andrea:** HeyGen Avatar IV, bg removed → transparent presenter. **Scenes:** Codex generates flat sticker ELEMENTS → **Remotion animates + composites in code.** **Transitions:** Remotion (code) + preset pack for editor cuts; AI morph for hero moments. **Voice:** TTS (HeyGen or ElevenLabs). **Output:** Remotion renders each module → embed in BMH Institute.

## Two cheap tests settle the biggest unknowns
1. HeyGen Avatar IV on the real Andrea art (1 credit) → does her mouth read?
2. (optional) One Higgsfield/Draw-to-Video test on a doodle scene → does it hold flat? (research says no, but cheap to confirm)

Sources in the agent transcripts; key: HeyGen Avatar IV guide, Remotion+Claude Code, Rive, School of Motion transitions, Higgsfield img2video docs.
