#!/bin/zsh
# Lesson 1B redo pass — one lane per image: zsh gen_1b_v2.sh <key>
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
D="docs/design"
OUT="course-assets/scenes/module-01"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. 16:9 composition, 1600x900.'
STYLE10='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Confidently imperfect, hand-drawn. The ONLY text allowed is the numeral 10 — no other letters or words anywhere. 16:9 composition, 1600x900.'

gen() {
  local file="$1"; local desc="$2"; local style="${3:-$STYLE}"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: $desc $style" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
story1)
  gen "m01_LB_story1_inherited_v2.png" "A simple doodle map of the United States (soft blobby national outline, a few faint interior state lines), filling the frame on plain cornflower blue. A tall location-pin marker planted on one spot in the middle of the country, and a small simple house planted roughly two states away. A dashed travel line arcs from the pin to the house. Nothing else — no text (labels are added later in code)." ;;
story3)
  gen "m01_LB_story3_frozen_v2.png" "One figure seen entirely from BEHIND (back of head and back of body only, no face), centered in the lower third, standing exactly where a single road splits into a fork of two diverging roads ahead. The figure looks forward at the fork. Roads are simple flat cream bands with dashed centerlines heading toward the horizon. Still, quiet, frozen-in-place mood." ;;
s02)
  gen "m01_LB_s02_guide-not-buyer_v2.png" "Playful adventure scene: two cast-board-style characters as cheerful explorers on a safari-style expedition — explorer hats and vests (flat cream/yellow/orange fills), one (wearing a phone headset under the hat) holding an open treasure map showing a dotted route to an X, pointing the way ahead; the other following happily. A dashed trail leads across the ground toward a small flag on a hill. The headset one is the GUIDE leading, not buying." ;;
p02)
  gen "m01_LB_p02_alignment_v2.png" "Two figures standing side by side facing the viewer, arms around each other's shoulders like teammates: one wearing a phone headset (the rep), the other a regular homeowner (the seller). Both with warm simple smiles. Centered, big and friendly, nothing else in frame." ;;
p04)
  gen "m01_LB_p04_detach_v2.png" "One friendly cast-board-style character wearing a phone headset doing a big relaxed shrug: shoulders raised high, both arms bent with palms turned up and out, calm easygoing smile. Centered, big in frame, nothing else." ;;
p07)
  gen "m01_LB_p07_long-game_v2.png" "The SAME simple house drawn four times in a 2x2 grid of equal quadrants separated by thin black divider lines, one quadrant per season. Top-left SUMMER: bright sun, lush full bushes, beautiful outdoors. Top-right AUTUMN: orange leaves falling and piled. Bottom-left WINTER: snow on the roof and ground plus a snowman beside the house. Bottom-right SPRING: flowers blooming around the house. Same house shape and position in every quadrant." ;;
p09)
  gen "m01_LB_p09_reps_v2.png" "A large classroom chalkboard on a simple wooden stand, filling most of the frame, covered in rows of white tally marks — groups of four vertical strokes with a fifth diagonal strike-through line crossing each group (reps being counted off). Chalk-style marks only, no letters, no numbers, no words." ;;
s03)
  gen "m01_LB_s03_clarity-shift_v2.png" "A pair of eyeglasses held up LARGE in the foreground, both lenses working like see-through windows. THROUGH the two lens areas, the house behind appears beautiful and renovated: fresh walls, neat roof, flowers, tidy yard. OUTSIDE the lenses, the SAME house in the background is in disrepair: cracked wall, boarded window, sagging roofline, patchy yard. The lens regions must line up with exactly what sits behind them — same house, fixed-up inside the lenses, run-down outside them." ;;
s07)
  gen "m01_LB_s07_ten-principles-board_v2.png" "A ten-commandments style stone tablet with a rounded double-arch top, standing upright and centered, filling most of the frame, in flat cream fill with a thick black wobbly outline. At the top: one big bold hand-drawn numeral 10 as the header. Below it: ten short horizontal rounded bars (pseudo-text lines) arranged as two columns of five, representing the ten principles." "$STYLE10" ;;
*) echo "unknown key $1"; exit 1 ;;
esac
