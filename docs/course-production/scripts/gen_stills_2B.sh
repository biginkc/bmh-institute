#!/bin/zsh
# Lesson 2B seller portraits — one lane per image: zsh gen_stills_2B.sh <key>
# Head-and-shoulders doodle portraits, ONE person each, generous even blue margin
# so each crops cleanly into the b07 recap grid AND serves as the HeyGen talking-avatar source.
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
D="docs/design"
OUT="course-assets/scenes/module-02-lesson2B"
mkdir -p "$OUT"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black, light gray hair) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No ambient doodles (no hearts, sparkles, notes, bubbles, motion marks). No text or words anywhere. 16:9 composition, 1600x900.'

gen() {
  local file="$1"; local desc="$2"; local style="${3:-$STYLE}"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: $desc $style" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
david)
  gen "m02_L2B_david.png" "Head and shoulders portrait of ONE cast-board-style doodle man in his sixties, heavyset with a round face, bald on top with grey hair at the sides and a full grey beard, orange shirt. Face and neck filled with a very pale warm off-white (near-white cream) — the SAME face tone as the rest of the cast, not yellow, not grey. Framed as a standard head-and-shoulders portrait that MATCHES the rest of the cast: the head is about half the image height, centered, with clear even cornflower-blue margin on ALL sides INCLUDING generous open blue space above the hair; the shoulders do NOT reach the left or right edges. Not zoomed in tight, not shrunk small — the same moderate zoom as a normal portrait. Weary, worn-out, heavy-eyed expression, downturned mouth. ICON-LEVEL face only: dot eyes, simple brows, one small nose line, one simple mouth line — NO forehead worry lines, NO extra cheek lines, NO shading lines inside the beard. Generous even cornflower-blue margin. EXACTLY ONE PERSON, no second person, no clone. Nothing else in frame." ;;
ray)
  gen "m02_L2B_ray.png" "Head and shoulders portrait of ONE cast-board-style doodle man in his forties, average build, short receding dark hair, clean-shaven, cream shirt. Face and neck filled with a very pale warm off-white (near-white cream) — the SAME pale face tone as the rest of the cast, not yellow-tinted. Framed as a standard head-and-shoulders portrait matching the rest of the cast: head about half the image height, centered, clear even cornflower-blue margin on all sides including generous space above the hair, shoulders NOT reaching the side edges. Overwhelmed, hollow, anxious expression, eyes a little wide and uncertain, a slight downturn to the mouth. EXACTLY ONE PERSON, no second person, no clone. Nothing else in frame." ;;
marcus)
  gen "m02_L2B_marcus.png" "Head and shoulders portrait of ONE cast-board-style doodle man in his thirties, lean with a slim face, fuller dark hair, clean-shaven, yellow shirt, centered with generous even cornflower-blue margin on all four sides. Face and neck filled with a very pale warm off-white (near-white cream) — NOT a saturated or yellow-tinted cream; the SAME pale face tone as the rest of the cast. Tense, stuck, worried expression, brow furrowed, staring straight ahead. EXACTLY ONE PERSON, no second person, no clone. Nothing else in frame." ;;
beth)
  gen "m02_L2B_beth.png" "Head and shoulders portrait of ONE cast-board-style doodle woman in her early forties, medium build, shoulder-length BLACK hair (NOT gray, she is not elderly), no glasses, white shirt, centered with generous even cornflower-blue margin on all four sides. Tired and wistful, quietly grieving expression: a small weary closed-mouth almost-smile that reads as sad, eyebrows gently raised, eyes a little downcast. Clearly a middle-aged woman, younger than a grandmother. EXACTLY ONE PERSON, no second person, no clone. Nothing else in frame." ;;
carol)
  gen "m02_L2B_carol.png" "Head and shoulders portrait of ONE cast-board-style doodle woman in her sixties, short curly light-gray hair, round glasses, cream shirt, centered with generous even cornflower-blue margin on all four sides. Frustrated, fed-up expression, lips pressed together, one eyebrow raised. EXACTLY ONE PERSON, no second person, no clone. Nothing else in frame." ;;
*) echo "unknown key $1"; exit 1 ;;
esac
