#!/bin/zsh
# Lesson 9A v4 — fix bench Andrea (skeletal→canonical full face) + b08 mover (man, real cardboard).
# zsh gen_stills_9A_v4.sh <bench|mover>
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "${0:A:h}/../../.." && pwd)}"
D="docs/design"
CAFE="course-assets/scenes/module-01/andrea_cafe.png"
OUT="course-assets/scenes/module-09"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Faces exactly match the attached references: small dot eyes, a SMALL SUBTLE CURVED NOSE (a tiny hook line like the reference), and a simple warm mouth. Cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No ambient doodles. No text or words anywhere. 16:9 composition, 1600x900.'

gen() {
  local file="$1"; local desc="$2"; shift 2
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached references EXACTLY, especially the face shape and proportions. COMPOSITION: $desc $STYLE" | \
  codex exec "$@" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
bench)
  gen "m09_L9A_bench_andrea.png" "ANDREA sitting relaxed on a simple doodle park bench, centered, full body clearly visible, facing the viewer, warm friendly open smile, hands resting calmly in her lap. She wears her bright yellow long-sleeve top and orange pants, NO phone headset. CRITICAL — her FACE and HEAD must match the attached Andrea cafe reference EXACTLY: a LARGE, ROUND, FULL white face that fills most of the head, with the eyes at the MIDDLE height of the face, the small curved nose in the center, and the warm open smile just below center. Do NOT draw a small, narrow, or pinched face; do NOT leave a big empty white area below the features; the face is big and round like the reference, not gaunt or skeletal. Big soft jet-black wavy curls frame the full round face. Behind the bench one simple rounded tree and a low bush; a few grass tufts at ground level. Nothing else. EXACTLY ONE PERSON, no clone. Her face and upper body large and clear (this becomes a talking avatar)." -i "$CAFE" -i "$D/cast-board.png" -i "$D/style-ref-1.png" ;;
mover)
  gen "m09_L9A_b08_beth_boxes.png" "A cheerful MALE seller in the middle of moving house, carrying a cardboard box. He is clearly a DIFFERENT person from the curly-black-haired yellow-top narrator Andrea: a MAN with SHORT dark-brown/black hair (neat, short, NOT curly, NOT a ponytail), wearing a CREAM t-shirt and orange pants with orange shoes. His face uses the canonical doodle style from the attached references: small dot eyes, a small curved nose, a simple friendly smile. He walks in place carrying ONE moving box with both arms; beside him a neat stack of two more boxes. The BOXES must look like REAL corrugated kraft cardboard moving boxes: warm kraft-brown/tan color, clearly drawn with the interlocking top flaps folded, a visible strip of beige packing tape across the top seam, and a thin corrugated-edge line — unmistakably cardboard shipping boxes, not plain brown blocks. Ready-to-move energy. Centered, nothing else. EXACTLY ONE PERSON, no clone. He must NOT resemble Andrea." -i "$D/cast-board.png" -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" ;;
*) echo "unknown key $1"; exit 1 ;;
esac
