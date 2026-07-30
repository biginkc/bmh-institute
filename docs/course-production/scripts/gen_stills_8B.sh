#!/bin/zsh
setopt pipefail
# Lesson 8B still candidates. Run one lane per image:
#   zsh docs/course-production/scripts/gen_stills_8B.sh <key>
set -u

cd "${BMH_INSTITUTE_ROOT:-$(cd "${0:A:h}/../../.." && pwd)}"

D="docs/design"
OUT="course-assets/scenes/module-08-lesson8B"
ANCH="$OUT/_anchors"
RAY="$ANCH/ray-8a-shipped.png"
GRACE="course-assets/scenes/module-08/_anchors/grace.png"
PRIYA="course-assets/scenes/module-18-lesson18A/_anchors/priya-brand.png"

mkdir -p "$OUT"

STYLE='STYLE: flat sticker-sheet doodle illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only, simple silhouettes, no gradients, no texture, no shadows, no lighting, no 3D, no perspective depth, no skin-tone shading. Tiny dot eyes, tiny simple curved noses, minimal mouths. Confidently imperfect hand-drawn course style. 16:9 composition, PNG, 1600x900.'
MINIMAL='MINIMALISM: every visible object must be listed in the prompt. No clutter on desk, floor, wall, bed, page, or background. Do not add props, people, labels, icons, decoration, papers, shelves, wall art, rugs, plants, extra boxes, motion marks, hearts, sparkles, notes, thought bubbles, or speech bubbles beyond the explicit list.'
NOTEXT='TEXT POLICY: no readable text, no letters, no numbers, no logos, no fake UI words, no watermarks. Leave blank shapes where Remotion will render all words later.'
NEG='NEGATIVE: no clone, no duplicate person, no extra people beyond the exact count requested, no photorealism, no 3D, no shading, no gradient, no clutter, no readable text.'

RAY_ID='IDENTICAL to the attached RAY reference cropped from the shipped 8A lesson: slim young man, short curly black hair, orange t-shirt, cream pants, yellow shoes, flat white face, tiny black dot eyes, tiny curved nose, simple mouth. Keep his face, hair, outfit, proportions, and course-doodle line style identical.'
GRACE_ID='IDENTICAL to the attached GRACE reference: elderly woman with grey hair in a bun, round glasses, orange cardigan over cream dress, flat white face, tiny dot eyes behind glasses. Keep her face, hair, glasses, outfit, and proportions identical.'
PRIYA_ID='IDENTICAL to the attached PRIYA reference: woman with dark hair pulled into a back ponytail, orange/yellow headband, orange headset with boom mic, yellow top, cream pants, orange shoes, flat white face, tiny black dot eyes, small curved hook nose, simple friendly mouth. Keep her face, ponytail, headset, nose shape, outfit, and proportions identical.'

need_refs() {
  for ref in "$@"; do
    if [[ ! -f "$ref" ]]; then
      echo "MISSING REF: $ref" >&2
      exit 1
    fi
  done
}

gen_base() {
  local file="$1"; shift
  local prompt="$1"; shift
  local refs=("$@")
  local ref_args=()
  need_refs "$D/style-ref-1.png" "$D/style-ref-2.png" "$D/object-board.png" "${refs[@]}"
  for ref in "${refs[@]}"; do
    ref_args+=("-i" "$ref")
  done
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file. Match the attached style references unless a specific off-brand page palette is explicitly requested. $prompt $STYLE $MINIMAL $NOTEXT $NEG" | \
    codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/object-board.png" "${ref_args[@]}" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -5
  [[ -f "$OUT/$file" ]] && echo "OK $file" || echo "MISSING $file"
}

gen_ray() {
  local file="$1"; shift
  local desc="$1"
  gen_base "$file" "CHARACTER ANCHOR: $RAY_ID COMPOSITION: $desc" "$RAY"
}

gen_ray_priya() {
  local file="$1"; shift
  local desc="$1"
  gen_base "$file" "CHARACTER ANCHORS: RAY: $RAY_ID PRIYA: $PRIYA_ID COMPOSITION: $desc" "$RAY" "$PRIYA"
}

gen_priya() {
  local file="$1"; shift
  local desc="$1"
  gen_base "$file" "CHARACTER ANCHOR: $PRIYA_ID COMPOSITION: $desc" "$PRIYA"
}

case "${1:-}" in
  b02_zillow)
    gen_base "m08_L8B_b02_zillow-listing.png" "COMPOSITION: doodle-style property-listing webpage replica, no people. Off-brand real-estate-listing palette is allowed: mostly white page, light gray lines, blue accent blocks, black doodle outlines. The page has exactly these structural shapes: one browser-like listing page frame; one large hero house photo area containing one simple doodle house exterior; one big blank price rectangle below or beside the hero area; three blank stat chips in a row for beds, baths, and square feet; one right-side blank cash-offer panel; one small blank map thumbnail or property-detail block. The shapes should clearly read like a Zillow-style listing page, but there must be no Zillow logo, no real brand name, no readable address, no price digits, no bed/bath/sqft text, and no button words. All text will be rendered later by Remotion." ;;
  b03_scam)
    gen_ray "m08_L8B_b03_scam-proof-path.png" "EXACTLY ONE person: Ray sits at a bare kitchen table, worried and guarded, holding or looking at a phone. On the table sits one blank notice folder. In the proof-path zone above the table are exactly THREE simple proof-path shapes arranged in one horizontal row and centered together as a balanced group: one title-company building icon, one attorney folder, one receipt shape. Do not include a company-info card or any fourth shape. Do not include blank cards, empty rectangles, empty squares, placeholder panels, or unused containers anywhere. Bottom-right 440x440 circle pocket remains completely empty flat blue. Props are only Ray, phone, blank notice folder, three proof-path shapes, simple table. No other objects. HARD FLAT STYLE: uniform solid cornflower-blue background only, no radial gradient, no glow, no airbrush, no soft shadow, no tonal background variation, solid flat fills only." ;;
  b04_attorney)
    gen_ray_priya "m08_L8B_b04_attorney-ally.png" "EXACTLY THREE people: Ray is the timid seller, hiding behind a calm attorney and peeking out from behind the attorney's side with a shy worried expression. The attorney is in front, calm and welcoming, with one small open-hand gesture. PRIYA is the BMH rep: woman with dark ponytail, orange headset with boom mic, yellow top, cream pants, orange shoes. Priya faces them with relaxed welcoming posture and holds one blank contract folder low. Include one simple small meeting table. The attorney is clearly a friendly bridge, not an opponent. Props are only Ray, attorney, Priya, blank contract folder, simple meeting table. Do not turn Priya into a man. Do not omit her ponytail or headset." ;;
  b05_bed)
    gen_ray "m08_L8B_b05_bed-family-dynamics.png" "EXACTLY TWO people in a minimal bedroom: Ray plays the confused husband in bed, looking unsure and caught in the middle. His wife is in the same bed, angry, arms crossed, turned away from him. Include exactly one bed, two pillows, one blanket, one small bedside table, and one small lamp. No wall art, no rug, no extra furniture, no phones, no papers, no clothes on the floor. Keep it funny and readable, not mean." ;;
  b07_belongings)
    gen_base "m08_L8B_b07_belongings-relief.png" "CHARACTER ANCHOR: $GRACE_ID COMPOSITION: EXACTLY TWO people: Grace, the elderly seller, stands in a sparse living-room-like open blue space holding one small keepsake frame with relieved posture. A BMH helper stands near a second box, ready to handle what is left. Include exactly two simple boxes and one small keepsake frame. No other furniture or belongings. Put ALL people and boxes in the left and center 60 percent of the frame. The lower-right 440x440 area must be completely empty flat blue for Andrea's circle overlay. HARD FLAT STYLE: uniform solid cornflower-blue background only, no radial gradient, no glow, no airbrush, no soft shadow." "$GRACE" ;;
  b09_grid)
    gen_ray "m08_L8B_b09_emotion-grid.png" "EXACTLY ONE character identity repeated across a 3x3 grid: Ray appears as the same cast seller in all nine panels. Each panel is a simple bust or half-body pose on the blue course plane, acting one emotion: grief, embarrassment, fear, family conflict, worry, overwhelm, doubt, relief, hope. The grid must read as one person carrying many kinds of emotional weight, not nine different people. Use the exact same face, hair, orange shirt, and proportions in every panel. Props are only the 3x3 grid frame and Ray repeated in nine panels." ;;
  b10_roleplay)
    gen_priya "m08_L8B_b10_roleplay-drill.png" "Flat doodle speech-coaching app UI sketch, inspired by a Yoodli-style layout but fully in the BMH course brand palette. NO readable text anywhere. Top-left: one large video-player tile showing PRIYA mid-practice inside the tile, with dark back ponytail, orange headset with boom mic, yellow top, small curved hook nose, and friendly focused expression. Under the player tile: one simple doodle play/progress bar with a play triangle and blank progress line. Below the player: one transcript panel with blank horizontal text lines and exactly 3 or 4 small blank highlighted pill shapes inline, representing flagged filler words. Right rail: exactly 3 or 4 stacked rounded blank metric cards; the bottom metric card is slightly larger and contains one small play button shape. Props are only the app frame, player tile, Priya, play/progress bar, transcript panel, blank lines, 3-4 blank filler pills, right metric rail, 3-4 metric cards, and one small play button. No Ray, no desk, no room, no furniture, no logos, no app name, no letters, no numbers, no extra icons, no extra buttons, no clutter. Keep all panels stable and clean with generous blue spacing." ;;
  *)
    echo "unknown key: ${1:-}" >&2
    echo "keys: b02_zillow b03_scam b04_attorney b05_bed b07_belongings b09_grid b10_roleplay" >&2
    exit 1
    ;;
esac
