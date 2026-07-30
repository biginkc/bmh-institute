#!/bin/zsh
# Lesson 2A stills — one lane per image: zsh gen_stills_2A.sh <key>
set -u
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
D="docs/design"
OUT="course-assets/scenes/module-02"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. 16:9 composition, 1600x900.'

gen() {
  local file="$1"; local desc="$2"; local style="${3:-$STYLE}"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: $desc $style" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
# ── 6-cell distraught-seller grid (b02 intro / b04 labeled / b08 thumbnails) ──
# Head-and-shoulders, ONE distinct person each, generous even blue margin so it crops cleanly into a grid cell.
grid1)
  gen "m02_L2A_grid1_inherited.png" "Head and shoulders portrait of ONE cast-board-style doodle person, short dark hair, cream shirt, centered in frame with generous even cornflower-blue margin on all four sides so it crops cleanly into a grid cell. Overwhelmed, sad expression, eyes glancing down and to the RIGHT. One hand holds up a small ring of house keys near the shoulder, and the person looks at the keys. EXACTLY ONE PERSON, no second person, no clone. Nothing else in frame." ;;
grid2)
  gen "m02_L2A_grid2_landlord.png" "Head and shoulders portrait of ONE cast-board-style doodle person, balding with a small mustache, orange shirt, centered with generous even cornflower-blue margin on all four sides so it crops cleanly into a grid cell. Exhausted, fed-up expression, pinching the bridge of the nose with one hand while the other hand holds a small wrench. Eyes closed or downcast. EXACTLY ONE PERSON, no second person, no clone. Nothing else in frame." ;;
grid3)
  gen "m02_L2A_grid3_divorce.png" "Head and shoulders portrait of ONE cast-board-style doodle person, ponytail, yellow shirt, centered with generous even cornflower-blue margin on all four sides so it crops cleanly into a grid cell. Downcast, heavy-hearted expression, one hand resting against the cheek, eyes looking away to the LEFT. EXACTLY ONE PERSON, no second person, no clone. Nothing else in frame." ;;
grid4)
  gen "m02_L2A_grid4_relocating.png" "Head and shoulders portrait of ONE cast-board-style doodle person, curly hair, white shirt, centered with generous even cornflower-blue margin on all four sides so it crops cleanly into a grid cell. Worried, uncertain expression, one hand gripping the upright handle of a small suitcase that rises beside the shoulder, eyes glancing to the RIGHT. EXACTLY ONE PERSON, no second person, no clone. Nothing else in frame." ;;
grid5)
  gen "m02_L2A_grid5_payments.png" "Head and shoulders portrait of ONE cast-board-style doodle person, round glasses, cream shirt, centered with generous even cornflower-blue margin on all four sides so it crops cleanly into a grid cell. Anxious, stressed expression, holding up a single plain rounded paper notice in both hands and staring at it. The paper is blank, no text or numbers. EXACTLY ONE PERSON, no second person, no clone. Nothing else in frame." ;;
grid6)
  gen "m02_L2A_grid6_repairs.png" "Head and shoulders portrait of ONE cast-board-style doodle person, long hair, orange shirt, centered with generous even cornflower-blue margin on all four sides so it crops cleanly into a grid cell. Stressed, overwhelmed expression, one hand pressed to the forehead, eyes looking up and to the LEFT at something troubling. EXACTLY ONE PERSON, no second person, no clone. Nothing else in frame." ;;

# ── b03 ideal-seller profile (Seedance idle start/end frame) ──
b03)
  gen "m02_L2A_b03_profile.png" "ONE cast-board-style homeowner standing calmly beside a simple, tired, dated little house they own — the house has a slightly crooked shutter, a small crack in the wall, and a weathered look, but it stands on a simple ground line. The person stands to the left of the house, one open hand gesturing toward it, with a slightly resigned, weary expression. EXACTLY ONE PERSON, no second person, no clone. Centered composition with open blue space above. Nothing else in frame." ;;

# ── b05 motivation: speed/certainty over price (Seedance idle start/end frame) ──
b05)
  gen "m02_L2A_b05_motivation.png" "ONE cast-board-style homeowner seated in a simple chair, calm and relieved, resting one hand on a neat stack of flat cream cash bills that sits on a low table beside them; next to the cash on the table is a simple round clock face. The person looks satisfied and settled. EXACTLY ONE PERSON, no second person, no clone. Centered composition, generous open blue space. Nothing else in frame, no numbers on the clock." ;;

# ── b06 two-panel: motivated | curious (MovieBeat still + still2) ──
b06m)
  gen "m02_L2A_b06_motivated.png" "ONE cast-board-style homeowner leaning forward in a simple chair, engaged and open, both hands gesturing as they talk, warm earnest expression, clearly sharing their situation. EXACTLY ONE PERSON, no second person, no clone. Centered composition with generous open blue space. Nothing else in frame." ;;
b06c)
  gen "m02_L2A_b06_curious.png" "ONE cast-board-style homeowner leaning back in a simple chair with arms crossed, aloof and skeptical, one eyebrow raised, glancing away disinterested. EXACTLY ONE PERSON, no second person, no clone. Centered composition with generous open blue space. Nothing else in frame." ;;

# ── b07 disqualifiers backdrop (recap-cascade of 4 labels over it) ──
b07)
  gen "m02_L2A_b07_disqualify.png" "On the LEFT, ONE cast-board-style rep wearing a phone headset stands calm and friendly, one open palm raised in a gentle polite 'no thank you' stop gesture. On the RIGHT, a small simple house floats upward on a string tied to a huge blank rounded price-tag balloon high in the upper-right sky (an unrealistic price). Keep the lower-center and mid frame as open blue space. EXACTLY ONE PERSON (the rep); no people by the house. No text or numbers on the price tag. Nothing else in frame." ;;
*) echo "unknown key $1"; exit 1 ;;
esac
