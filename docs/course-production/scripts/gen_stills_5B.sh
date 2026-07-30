#!/bin/zsh
# Lesson 5B "The Fact Find" stills — one lane per image: zsh gen_stills_5B.sh <key>
# Fire each key as its own background bash call (all lanes in one turn).
set -u
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
D="docs/design"
OUT="course-assets/scenes/module-05-lesson5B"          # ISOLATED from 5A's module-05
REP="course-assets/avatar-candidates/andrea_headset_v2.png"   # headset-Andrea identity ref
mkdir -p "$OUT"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. 16:9 composition, 1600x900.'

# generic gen (style refs only)
gen() {
  local file="$1"; local desc="$2"; local style="${3:-$STYLE}"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: $desc $style" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}
# rep gen (adds the headset-Andrea identity ref for in-scene rep beats)
genrep() {
  local file="$1"; local desc="$2"
  echo "=== GENREP $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. The woman wearing the phone headset (our BMH representative) must have the IDENTICAL face to the attached headset reference image: tiny dot eyes, small simple nose, same headset. COMPOSITION: $desc $STYLE" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" -i "$REP" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
# b02 (WRONG way, comedic) — the fact find as an INTERROGATION. Andrea as a Men-in-Black interrogator.
interrogation)
  genrep "m05_L5B_interrogation.png" "A dim basement interrogation room, comedic and exaggerated. On the LEFT, the BMH representative woman with the phone headset is dressed like a Men-in-Black agent: plain BLACK boxy suit and BLACK sunglasses covering her dot eyes, standing stiffly and leaning in intimidatingly, one hand flat on a bare metal table. A single harsh cone of yellow light beams straight DOWN from a bare hanging bulb onto the table between them. On the RIGHT, sitting across the metal table, a DIFFERENT nervous homeowner (no headset, no sunglasses, plain worried face, small sweat drops, hands up defensively) leans back away from her. EXACTLY TWO clearly different people. Dark cornflower-blue basement walls, minimal, empty. Palette only. Nothing else in frame." ;;

# b02 (RIGHT way) — the fact find as a warm CONVERSATION. Same two people, relaxed.
conversation)
  genrep "m05_L5B_conversation.png" "A warm, relaxed living-room chat. On the LEFT, the BMH representative woman with the phone headset sits comfortably in a simple armchair, leaning in with a warm friendly smile and an open, listening posture, a coffee mug in hand. On the RIGHT, a DIFFERENT relaxed homeowner (no headset, plain calm friendly face) sits on a small two-seat couch, at ease, mid-conversation. A low coffee table with two mugs between them, a simple potted plant behind. EXACTLY TWO clearly different people, no clone. Open cornflower-blue above. Palette only. Nothing else in frame." ;;

# b03 — a computer MONITOR (black bezel) showing a Zillow-style property listing sketch (wordless; labels are code)
computer)
  gen "m05_L5B_computer.png" "A single desktop computer monitor centered and large in the frame, shown straight-on. The monitor has a thick BLACK rectangular bezel/frame and a small black stand, so it clearly reads as a computer screen. On the cream screen inside the bezel: a simple real-estate LISTING layout in doodle style — a large doodle house thumbnail across the top of the screen, and below it a row of three small blank stat blocks (simple bed, bath, and ruler icons with empty blank lines beside them), and a wide blank price bar at the bottom. All rows and labels are BLANK rounded shapes (the words are added later in code). Generous open cornflower-blue around the monitor. Absolutely NO letters, numbers, or words anywhere on the screen. Nothing else in frame." ;;

# b05 — an official title / deed document (wordless; a wax seal + ribbon sell that it is a deed; labels are code)
deed)
  gen "m05_L5B_deed.png" "A single official-looking title or deed document centered and large in the frame: an upright cream sheet of paper with a thick black outline and slightly curled top corners. Near the top, a bold blank header banner (empty rounded bar) and a decorative double-line border. In the lower-left corner, a round orange wax seal with a yellow ribbon to make it clearly read as an official deed. Down the page, a few BLANK horizontal rounded lines and two blank signature lines (empty — words added later in code). Generous open cornflower-blue around the document. Absolutely NO letters, numbers, or words anywhere. Nothing else in frame." ;;

*) echo "unknown key $1"; exit 1 ;;
esac
