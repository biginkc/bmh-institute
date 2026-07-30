# Scene Card v2 — the production format (motion + layers + Andrea mode)

**Created 2026-07-03.** The v1 shotlist (`shotlists/module-01-shotlist.md`) describes *still* compositions and assumes Andrea is always a lower-right overlay. Both are stale vs the locked stack (`ARCHITECTURE.md`). This is the v2 format every scene gets. Below: the blank template, the mode/layer vocabulary, then a worked example (scene 5, cash-asis).

---

## Andrea presence mode (required, per beat)
How the speaking avatar appears. Varies by beat — this is a directorial call, not a fixed rule.

| Mode | What it is | Use for |
|---|---|---|
| `hero-solo` | Andrea alone on cornflower blue, full body, speaking. No scene art. | Direct-address / emotional beats (the old `[FULL]` tags: intro, sincerity, philosophy, mission, send-off). |
| `corner-circle` | **Face-only** Andrea in a circle badge, one corner, over a live animated scene (Remotion crops the head/shoulders region from the same full-body HeyGen clip — one generation serves all modes). | Explanatory scene beats where her presence reassures but the scene teaches. |
| `voice-only` | Andrea NOT on screen. Animated scene carries it; her voice narrates. | Concept cards, principle cards, montages — where the visual IS the point. **No space reserved for her.** |
| `side-full` | Andrea full-body off to one side, gesturing at scene content beside her. | Beats where she actively presents/points at a diagram. |

## Layer sources (who animates each element)
- `still` — static plate, no motion (Remotion just places it).
- `grok` — isolated element cut to its own flat-blue plate, animated by Grok Video, composited back. **Organic character/creature motion.** Interacting characters (e.g. a handshake) go on ONE plate together; independent characters get separate plates.
- `remotion` — code-animated element (transform/opacity). **Precise, frame-exact, free, perfectly loopable.** Default for ambient (drift, twinkle, bob, flap) and anything where exact timing/loop matters.

---

## Blank template

```
### Scene <id> — `<tag>`  ·  VO beat: <ref/first words>
- Andrea mode: <hero-solo | corner-circle | voice-only | side-full>  · placement: <corner/side/n-a>
- Source still: <existing PNG or "generate">
- Still bg plate: <elements that stay static>
- Layers:
    | element | source | motion | loop? |
    |---------|--------|--------|-------|
- Transitions: in <…> / out <…>   (Remotion)
- Plates to cut: <list of isolated PNGs to produce from the source>
- Timing: driven by VO length (<~s>)
```

---

## Worked example — Scene 5, `cash-asis`
Source: `course-assets/scenes/module-01/m01_LA_s05_cash-asis.png` (house left, woman+man handshake at door, floating cash + sparkle, clouds, birds, bush/plant/grass). Illustrates: seller can sell as-is for cash.

- **Andrea mode:** `corner-circle` · placement: **right** (right ~40% of frame is open blue). *Directorial default — flip to `voice-only` if the beat plays better as pure scene.*
- **Source still:** existing PNG above.
- **Still bg plate:** house + roof + window + door + step + bush + potted plant + grass tufts (static).
- **Layers:**

    | element | source | motion | loop? |
    |---|---|---|---|
    | woman + man (handshake pair) | **grok** — ONE plate (they interact) | subtle handshake up-down + breathing idle | ~loop |
    | clouds ×2 | remotion | slow drift right, wrap | yes |
    | sparkle | remotion | twinkle (scale+opacity pulse) | yes |
    | cash stack | remotion | gentle bob + tiny rotate | yes |
    | birds | remotion | wing flap (2-state) | yes |

  *Note: Grok earns exactly one plate here — the organic handshake. Everything ambient is cheaper and cleaner as Remotion.*
- **Transitions:** in = cross-dissolve from scene 4 (`hard-moments`) / out = cut to scene 6 (`fulfilling-work`). (Remotion)
- **Plates to cut (programmatic):** `m01_LA_s05__bg.png` (background minus pair+ambient), `m01_LA_s05__pair.png` (handshake couple on flat blue). Ambient elements are redrawn/animated in Remotion, not cut.
- **Timing:** driven by scene-5 VO length.

---

## Standing rules (added 2026-07-03, from Jarrad's v1 review)
1. **Full pre-assembly approval gate (expanded 2026-07-03):** before any lesson assembly, Jarrad gets EVERY artifact that will appear in the cut — all stills, every animation clip (Grok plates, overlays, palindromes), every narration sample/voice choice, intro/outro elements, end-cards. One review package, approve/flag per item. Claude judges *style* first; Jarrad judges *communication*. NOTHING enters a render unapproved — no more discovering problems in the assembled video.
1b. **No ambient doodles (2026-07-03):** scenes contain the subject and necessary props ONLY. No floating hearts, sparkles, notes, thought bubbles, motion marks. (Supersedes the earlier "attached ambience OK" judgment.)
1d. **MINIMALISM — the purpose test (Jarrad, 2026-07-09 — GLOBAL, supersedes looser prop guidance):** no clutter on the desk, the floor, or the wall. EVERY element in a scene must have a clearly definable purpose and value in that beat — if you cannot state the object's job in one sentence, it does not go in. Scene-card visual directions list props explicitly and exhaustively; generation prompts forbid additions beyond the list. Simplicity over decoration, always. QC enforces as a FAIL class (purposeless prop/clutter).
1d-ii. **NO BLANK SHAPES (Jarrad, 2026-07-10 — GLOBAL; kills the "blank card for later code overlay" convention everywhere):** never render an empty rectangle, card, chip, panel, signboard, or any other blank shape with no text and no job. If a shape exists to hold text, the text is BAKED into it at generation (rule 1f); if it has no content, it does not exist. Applies at three points: scene cards may not spec blank placeholder shapes; generation prompts must say so explicitly; QC fails any frame containing one (8B v1 b03 "company-info card" and 19 v5 "empty signboards" are the reference violations). Older scenecards written to the blank-card convention (e.g. ISP) must be swept before production.
1e. **NO CODE-RENDERED SCENE VISUALS (Jarrad, 2026-07-09 — GLOBAL, supersedes every "Remotion board/diagram/calendar/tile" pattern):** Remotion may ONLY (a) place/composite images, (b) run slide transitions, (c) pop in text. It never draws scene content — no code boards, diagrams, calendars, tiles, counters, props, or any visual element of the scene itself. Every board/diagram/prop is generated art (Codex `gpt-image-2`). Extends PLAYBOOK 11.6 ("code drawing motion is terrible") from motion to ALL code-drawn visuals.
1f. **TEXT: BAKED INTO GENERATED ART BY DEFAULT (Jarrad, 2026-07-09 — GLOBAL, supersedes the "no text in AI images" default and the single-word cap of rule 6):** the image generator bakes static prop/diagram text into the art (board headings, signs, price tags, calendar numbers, recap tiles). Remotion text is reserved for exactly two cases: (a) word-timed labels that dynamically transition in with narration (the bottom-center Sticker queue), (b) text that needs dynamic positioning during narration. Judge EVERY baked text for garbling at the image gate (garble risk grows with text count/length); fallback on garble = code overlay for that text only.
1g. **CHARACTER SKIN = PURE WHITE, never cream (Jarrad, 2026-07-11 — GLOBAL, ALL agents incl. Codex):** every doodle character's exposed skin — face, hands, neck, ears — is pure white (~#FAFBFA), matching Andrea's narrator face. It is NEVER the cream/tan the generator and Seedance default to. THE TRAP that shipped cream faces 3× on ISP: skin ≈ shirt ≈ pants ≈ cream cards (same color) AND a face is the same px-size as pants — so you cannot separate skin from clothing by color OR size. A rectangular matte spills onto the same-cream shirt (white BOX on the chest); a size filter silently skips large faces; a zone fill whitens the card behind a face. The ONLY reliable separator is POSITION + the black outlines: **flood-fill from a point on each face/hand** (stops at the character's own outline, cannot touch a card behind them), box only the rare merged face≈shirt case, then RESTORE any clothing that bled. Reusable method + machine verifier: `scripts/whiten_character_skin.py`. **You may NOT gate a skin/color fix by eyeballing or a debug overlay** — white(250,251,250) vs cream(253,245,222) is 3 values apart, not eyeball-distinguishable; run the residual scan on the OUTPUT until it reports 0 skin-misses AND 0 clothing-bleeds, THEN look. Same principle for the canonical-blue normalization. QC FAIL class: any cream skin, any white box on a body, any face/hand skin-tone mismatch.
1c. **Transforms must never clip art:** frame scale/offset values are fit-computed from the content bounding box; verify with a per-beat proof still before any full render.
2. **Space is reserved for Andrea ONLY when she's on screen.** `voice-only` beats must be **centered** compositions — never left-weighted. Right-side space only for `corner-circle`/`side-full`.
3. **Transition language (SHARPENED by Jarrad, 2026-07-08 — supersedes the earlier wording):** the Lesson 1A camera-travel slide is used **exclusively** where the cut reads as the camera moving to a **different location on the blue plane** (scene→scene). Graphic-to-graphic / diagram-to-diagram beat changes are **straight cuts** (pop-ins for their internal elements). Fades ONLY at the true open/close bookends and end-card. Never a mid-lesson fade, never a slide between two diagrams.
3c. **Clean openers (Jarrad, 2026-07-08 — GLOBAL):** the OPENING beat of every lesson carries **NO text labels or stickers of any kind** — no title card, no word-timed callouts, nothing. The only overlay allowed on an opener is the B|M|H logo badge (rule 6c). Openers are Andrea + scene only.
3b. **Label queue (Jarrad, 2026-07-08 — GLOBAL):** every transient Remotion text label appears **bottom-center** by default. **Exactly one label visible at a time**: the current label animates out fully **before** the next animates in (queue, never stack, never simultaneous). Exception: text explicitly positioned elsewhere for a specific compositional purpose — diegetic prop text (calendar day tags, checklist rows, tile captions, code-rendered diagram headings) that belongs to the object it sits on. When in doubt, it's a transient label → bottom-center queue. QC enforces both 3 and 3b on every render.
4. **Narration pace:** `voice_settings: {speed: 0.9}` on every HeyGen generation. Hands: `motion_prompt` "hands relaxed at sides, minimal natural gestures", `expressiveness: low`.
5. **Palette:** locked 5-color — NO additions (Jarrad, 2026-07-03). Exception principle: when an object fails to *communicate* in palette colors (e.g. moving boxes reading as orange gift boxes), render that object in its real-world color (cardboard kraft) as a one-off communication fix. That's object realism, not a palette change — don't generalize it.
6c. **BMH badge on every opening (Jarrad, 2026-07-03):** every lesson module's OPENING beat carries the doodle B|M|H logo badge, lower-right corner (~130px, `<BmhBadge/>` in Remotion). Standing for all future modules.
6b. **Narrated text appears on screen (Jarrad, 2026-07-03, 1B gate):** when Andrea names a principle, a story beat, or any enumerated concept, its short text pops on screen word-timed (V1 white-card sticker, trigger word from the speech-endpoint word timestamps). Applies to the ten principles, story vignette titles, and future enumerations — add a `Text:` line to every such scene card.
6. **Single-word exception to the no-text-in-art rule:** one short caps word (e.g. FORECLOSURE on a notice) may be generated in-image; judge for garbling, fall back to a Remotion text overlay if it fails.

## Text style — "Sticker" system (added 2026-07-03; component: `remotion/src/Sticker.tsx`)
**SCOPE NARROWED by rule 1f (2026-07-09):** the Sticker system now covers ONLY word-timed transient labels and dynamically-positioned narration text. Static prop/diagram text is baked into the generated art by the image generator (judge for garbling at the image gate). Look = the sticker system itself: flat fill, thick black border (4–7px by role), rounded corners, spring pop-in with a tiny tilt.
- **Roles:** `title` (big lockup, yellow pill) · `label` (1–4 word callout / key vocab, yellow or cream) · `caption` (one full line, bottom-center strip — never over Andrea's corner).
- **Colors:** locked palette only — yellow `#FFD23F`, cream `#FFF7DE`, white, ink `#111`.
- **LOCKED (Jarrad, 2026-07-03): V1 — plain white rounded card, NO outline, soft shadow, Baloo 2 font.** (Comic-style bordered pills rejected.) Full-width white band (V3) available for long captions if a beat needs it.
- **Rules:** transient teaching labels default to bottom-center and render as a single-label queue: one label visible at a time, then removed/replaced by the next trigger. Non-bottom placement is only for an explicit prop/diagram purpose documented in the scene card. Text enters WITH the spoken word it matches; safe margins ≥60px; scene cards get a `Text:` line listing any sticker + its trigger word.

## Rollout order
1. Prove THIS card end-to-end (cut plates → Grok the pair → Remotion composite bg+ambient+transitions → HeyGen Andrea corner-circle right). That validates the format.
2. Convert the rest of Module 1's v1 shotlist to v2 cards (assign Andrea mode per beat; most concept/principle cards → `voice-only`).
3. Scale to Modules 2–19.
