#!/bin/zsh
# Lesson 2A v2 stills — one lane per image: zsh gen_stills_2A_v2.sh <key>
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
D="docs/design"
OUT="course-assets/scenes/module-02"
ANDREA="course-assets/avatar-candidates/andrea_headset_v2.png"
ENDCARD="docs/course-production/remotion/public/lessonA/bmh-endcard.png"
LOGO="/Users/jarradhenry/Sites/bmh-training-videos/public/bmh-logo.png"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. 16:9 composition, 1600x900.'
# palette-stretch variant for the two-setting split (snow + beach need their own colors)
STYLE_SCENIC='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs. Confidently imperfect, hand-drawn. No skin-tone shading. Colors may extend beyond the core palette ONLY as needed for the snow (white/pale) and beach (warm sand/sun) settings; keep everything else flat and doodle. No text or words anywhere. 16:9 composition, 1600x900.'

case "$1" in
# ── Office Andrea avatar SOURCE (→ HeyGen photo avatar; gated) ──
office_andrea)
  echo "=== GEN office-andrea source ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/m02_L2A_office_andrea.png (PNG, 1600x900). The FIRST attached image is Andrea — reproduce her face and hair EXACTLY: same tiny dot eyes, small nose, simple smile, same dark curly hair. COMPOSITION: Full-body doodle illustration of Andrea standing in a simple office, warm and friendly, hands relaxed at her sides, front-facing. A simple office desk with a chair sits to one side. On the wall directly behind her is the B|M|H logo lockup reproduced from the last two attached logo references (serif capitals B, M, H separated by thin vertical divider bars, dark green badge). Andrea centered, her full body visible from head to feet with a little floor space beneath her, generous plain cornflower-blue space around her. STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no shadows, no perspective. The ONLY text allowed is the B M H logo lockup on the wall; its dark green badge is a permitted brand exception. No other letters, numbers, or words anywhere. 16:9 composition, 1600x900." | \
  codex exec -i "$ANDREA" -i "$D/style-ref-1.png" -i "$D/cast-board.png" -i "$ENDCARD" -i "$LOGO" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/m02_L2A_office_andrea.png" ] && echo "OK office_andrea" || echo "MISSING office_andrea" ;;

# ── b10 Out-of-state owner: dramatic horizontal split (snowy CO top / beach seller bottom) ──
outofstate)
  echo "=== GEN out-of-state split ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/m02_L2A_b10_outofstate.png (PNG, 1600x900). Match the attached doodle style. COMPOSITION: The frame is split into two halves by one straight horizontal black line across the middle. TOP HALF is a cold snowy winter scene: a simple little cream house with an orange roof sitting in deep white snow, two simple pale mountain peaks behind it, and a few falling snowflakes. BOTTOM HALF is a warm sunny beach: ONE relaxed homeowner lounging back on a beach chair wearing big black sunglasses, arms behind the head, with a simple palm tree, a round sun, and a strip of sandy ground. The contrast reads as the owner relaxing far away in the sun while their property sits alone in the snow. Exactly one person, in the bottom beach half only. $STYLE_SCENIC" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/m02_L2A_b10_outofstate.png" ] && echo "OK outofstate" || echo "MISSING outofstate" ;;

# ── b18 Angry caller START-FRAME (→ Seedance anim: repeated frustrated pickup) ──
angrycaller)
  echo "=== GEN angry-caller start-frame ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/m02_L2A_b18_angrycaller.png (PNG, 1600x900). Match the attached doodle style. COMPOSITION: ONE cast-board-style homeowner seated at a simple desk, visibly angry and fed up: eyebrows furrowed low, mouth in a hard frown. One hand is slamming down flat on the desk, the other hand is snatching up an old-fashioned corded phone handset toward the ear. A simple phone base with a cord sits on the desk in front of them. Exactly one person, no clone, no second person. Centered, generous plain cornflower-blue space around. $STYLE" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/m02_L2A_b18_angrycaller.png" ] && echo "OK angrycaller" || echo "MISSING angrycaller" ;;

# ── b20 Trust close: extreme close-up of two hands shaking ──
handshake)
  echo "=== GEN handshake close-up ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/m02_L2A_b20_handshake.png (PNG, 1600x900). Match the attached doodle style. COMPOSITION: An extreme close-up of two hands clasped in a warm, firm handshake, filling most of the frame. Two forearms come in from the left and the right and meet in the center: the LEFT sleeve is cream, the RIGHT sleeve is orange, so they clearly read as two different people. Simple doodle hands with thick black outlines, flat fills, a couple of simple knuckle and finger lines. Centered on plain cornflower-blue. No faces, no bodies, just the two hands and forearms shaking. $STYLE" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/m02_L2A_b20_handshake.png" ] && echo "OK handshake" || echo "MISSING handshake" ;;
*) echo "unknown key $1"; exit 1 ;;
esac
