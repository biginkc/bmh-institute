#!/bin/zsh
setopt pipefail
# Lesson 3B stills — one lane per image: zsh gen_stills_3B.sh <key>
# Keys: homeowner (RUN FIRST — b06 avatar source), rundown, offer, ideal, notafit, relieved
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "${0:A:h}/../../.." && pwd)}"
D="docs/design"
OUT="course-assets/scenes/module-03-lesson3B"
mkdir -p "$OUT"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. 16:9 composition, 1600x900.'
STYLEG='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills — palette is yellow, orange, cream, white, black on cornflower-blue, PLUS money-green used ONLY for cash / bank-notes (an intentional communication exception so money reads as money). No gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. 16:9 composition, 1600x900.'
STYLEGSOLD='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills — palette is yellow, orange, cream, white, black on cornflower-blue, PLUS money-green used ONLY for cash / bank-notes. No gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs. Confidently imperfect, hand-drawn. No skin-tone shading. The ONLY text allowed anywhere is the single word SOLD on the yard sign — no other letters or words. 16:9 composition, 1600x900.'

gen() {
  local file="$1"; local desc="$2"; local style="${3:-$STYLE}"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: $desc $style" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
homeowner)
  # b06 avatar source: front-facing single male homeowner, clear unobstructed mouth for Avatar IV lip-sync.
  gen "m03_L3B_s06_homeowner.png" "A single male homeowner character shown front-facing, upper body and head, centered on plain cornflower blue with nothing else in the frame. His expression is weary and overwhelmed: worried simple dot eyes, eyebrows raised in concern, a slightly downturned simple line mouth. He wears plain everyday clothes in flat cream and orange fills. His MOUTH is clearly visible and completely unobstructed; his hands rest low, clasped at his chest — NOT near his face. EXACTLY ONE person in the entire image — no second person, no duplicate, no clone, no reflection, no crowd. No house, no props, no background objects — just the character on flat blue." ;;
rundown)
  # b05 disrepair house AND the static bg plate behind the b06 homeowner — deliberately NO people.
  gen "m03_L3B_s05_rundown-house.png" "A single run-down house centered in frame on plain cornflower blue: a sagging roof with a couple of missing shingles and a small drip, peeling patchy walls, one cracked and partly boarded window, a crooked door, and an overgrown jungle-like front yard with tall messy weeds and an unruly bush. Flat doodle sticker style. NO people anywhere in the image — the house and yard only." ;;
offer)
  gen "m03_L3B_s02_offer-recap.png" "A simple friendly house sitting left-of-center on plain cornflower blue, and to its right a neat fanned stack of cash bills floating with a gentle lift. The cash bills are drawn in MONEY-GREEN (a US bank-note green) so the money reads clearly as cash; everything else stays in palette. Clean and positive. NO people in the image — just the house and the green cash." "$STYLEG" ;;
ideal)
  # ticks/labels drawn in Remotion — board rows stay EMPTY.
  gen "m03_L3B_s03_ideal-seller.png" "One friendly homeowner character standing on the left, turned slightly toward and gesturing an open hand at a tall upright checklist board on the right. The board is a flat cream panel with a thick black outline showing SIX empty rounded horizontal rows, each with an empty square checkbox at its left — all rows and checkboxes EMPTY (no marks, no letters, no numbers; checkmarks and words are added later in code). EXACTLY ONE person in the entire image — no second person, no duplicate, no clone. Nothing else in frame." ;;
andreastop)
  gen "m03_L3B_s04_andrea-stop.png" "A single friendly female customer-service rep character — match the Andrea character on the cast-board reference (same hair and simple face style), wearing a phone HEADSET with a mic — shown front-facing from about the waist up, positioned in the LEFT 40 percent of the frame on plain cornflower blue. She holds ONE arm raised with her open palm facing the camera in a clear STOP gesture; calm neutral expression. Her whole figure and raised hand stay within the left 750 pixels — nothing crosses the horizontal center; the right side is empty flat blue. EXACTLY ONE person in the entire image — no second person, no duplicate, no clone. Nothing else in the frame." ;;
relieved)
  gen "m03_L3B_s07_relieved-seller.png" "A single relieved homeowner character walking to the right with a light easy step, calm and happy simple smile, holding a small neat fanned stack of MONEY-GREEN cash bills in one hand. Behind and to the left stands a RUN-DOWN, DISTRESSED house in the same sorry fixer-upper state as before: a sagging yellow roof with a couple of black holes and missing shingles, peeling patchy walls, a cracked and partly boarded window, an overgrown weedy yard. In front of that house is a yard sign on a post whose board reads 'SOLD' in bold hand-drawn black capital letters (the ONLY text allowed in the image is the single word SOLD). Relaxed, weight-lifted mood — the seller walks away with cash from the as-is house that was NOT repaired. EXACTLY ONE person in the entire image — no second person, no duplicate, no clone." "$STYLEGSOLD" ;;
*) echo "unknown key $1"; exit 1 ;;
esac
