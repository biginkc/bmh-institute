#!/bin/zsh
# Regenerate b02 interrogation still with the LOCKED 5B seller (couch-picture seller anchor).
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
D="docs/design"
OUT="course-assets/scenes/module-05-lesson5B"
REP="course-assets/avatar-candidates/andrea_headset_v2.png"
SELLER="$OUT/_anchors/seller.png"
STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn wobbly outlines, flat fills only (yellow, orange, cream, white, black) on cornflower-blue, no gradients, no shadows, no skin-tone shading. Tiny dot eyes, minimal features. No text or words anywhere. 16:9, 1600x900.'
read -r -d '' PROMPT <<EOF
Generate one image with gpt-image-2 and save it to $OUT/m05_L5B_interrogation.png (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: A dim basement interrogation room, comedic and exaggerated. On the LEFT, the BMH representative woman has the IDENTICAL face to the attached HEADSET reference image (tiny dot eyes, small nose, orange phone headset) but is dressed like a Men-in-Black agent: plain BLACK boxy suit and BLACK sunglasses, leaning in intimidatingly with one hand flat on a bare gray metal table. A single harsh cone of yellow light beams straight DOWN from a bare hanging bulb onto the table. On the RIGHT, sitting across the table, is the SAME seller as the attached SELLER reference image: IDENTICAL short dark curly hair, plain white face with tiny dot eyes, the SAME ORANGE sweater, cream pants and yellow shoes, but now NERVOUS: leaning back away from her, both hands up defensively, a few small sweat drops, worried open mouth. EXACTLY TWO clearly different people, no clone. Dim cornflower-blue basement walls, empty. Palette only. Nothing else in frame. $STYLE
EOF
echo "$PROMPT" | codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" -i "$REP" -i "$SELLER" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -4
[ -f "$OUT/m05_L5B_interrogation.png" ] && echo "OK interrogation" || echo "MISSING"
