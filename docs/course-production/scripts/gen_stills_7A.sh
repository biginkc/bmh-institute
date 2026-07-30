#!/bin/zsh
# Lesson 7A base plates — one lane per image: zsh gen_stills_7A.sh <key>
# Each recurring cast member is anchored to its crop in course-assets/scenes/module-07/_anchors/.
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "${0:A:h}/../../.." && pwd)}"
D="docs/design"
A="course-assets/scenes/module-07/_anchors"
OUT="course-assets/scenes/module-07"
mkdir -p "$OUT"
STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. No floating hearts, sparkles, notes, thought bubbles, or motion marks. 16:9 composition, 1600x900.'
NEG='NEGATIVE: no clone, no duplicate person, no second copy of the character, no extra people, no photorealism, no 3D, no shading, no gradient, no readable text.'

# JIM / MARK / DAVID identity locks (must match the attached anchor exactly)
JIM='IDENTICAL to the attached JIM reference: a friendly balding man with round orange goggles pushed up on his forehead, a mustard-YELLOW collared polo shirt, cream pants, orange shoes, tiny black dot eyes, simple bracket nose, small smile. Keep his face, hair, goggles and outfit exactly as the reference.'
MARK='IDENTICAL to the attached MARK reference: a young man with short black hair, an ORANGE t-shirt, yellow pants, cream shoes, tiny black dot eyes, simple bracket nose. Keep his face, hair and outfit exactly as the reference.'
DAVID='IDENTICAL to the attached DAVID reference: a heavyset older man, bald on top with a full grey beard, an ORANGE long-sleeve shirt, yellow pants, orange shoes, tiny black dot eyes. Keep his face, beard and outfit exactly as the reference.'

# gen <file> <anchor.png> <identity-line> <composition>
gen() {
  local file="$1"; local anchor="$2"; local ident="$3"; local desc="$4"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly and keep the character IDENTICAL to the attached character reference. CHARACTER: $ident COMPOSITION: $desc $STYLE $NEG" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$anchor" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
b02_goodsign)
  gen "m07_L7A_b02_goodsign.png" "$A/jim.png" "$JIM" "EXACTLY ONE person: JIM standing, holding a smartphone to one ear with one hand, the other hand open in a natural mid-talking gesture, leaning slightly forward, engaged and interested expression. He is pushing back but still leaning in. Standing on a simple ground line, centered, generous open cornflower-blue space around. EXACTLY ONE PERSON." ;;
b03_reframe)
  gen "m07_L7A_b03_reframe.png" "$A/jim.png" "$JIM" "EXACTLY ONE person: JIM standing, smartphone held to his ear, still mid-conversation, calm open expression, one hand gesturing gently as if the talk is still going. Two or three small curved signal arcs rise from the phone to show the call is still connected. Standing on a simple ground line, centered, generous open cornflower-blue space around. EXACTLY ONE PERSON." ;;
b04cold)
  gen "m07_L7A_b04cold_mark.png" "$A/mark.png" "$MARK" "EXACTLY ONE person: MARK standing just inside a doorway with his arms crossed tightly, guarded and defensive posture, wary expression, chin slightly raised. A simple doodle door frame is beside him, the door partly open. Standing on a simple ground line, framed to the LEFT third so the right side is open cornflower-blue. EXACTLY ONE PERSON." ;;
b04warm)
  gen "m07_L7A_b04warm_jim.png" "$A/jim.png" "$JIM" "EXACTLY ONE person: JIM seated relaxed at a simple kitchen table, phone resting flat on the table, open easy posture, one hand on the table, warm approachable expression, ready to talk about the deal. Seated on a simple ground line, framed to the RIGHT third so the left side is open cornflower-blue. EXACTLY ONE PERSON." ;;
b06_silence)
  gen "m07_L7A_b06_silence.png" "$A/jim.png" "$JIM" "EXACTLY ONE person: JIM standing gone quiet, phone lowered to his side, one hand thoughtfully at his chin, calm and processing, mouth closed, eyes considering. Quiet, still, thinking. Standing on a simple ground line, centered, generous open cornflower-blue space around. EXACTLY ONE PERSON." ;;
b07_complaints)
  gen "m07_L7A_b07_complaints.png" "$A/david.png" "$DAVID" "EXACTLY ONE person: DAVID standing, venting and frustrated, one hand raised palm-up in an exasperated 'enough already' gesture, a smartphone in the other hand held down at his side, tired annoyed expression, eyebrows drawn. Standing on a simple ground line, centered, generous open cornflower-blue space around. EXACTLY ONE PERSON." ;;
b08_reactionary)
  gen "m07_L7A_b08_reactionary.png" "$A/mark.png" "$MARK" "EXACTLY ONE person: MARK standing in a simple store aisle with two plain shelving units behind him holding a few flat doodle boxes, arms crossed, giving a dismissive 'just looking' brush-off, casual guarded expression. Standing on a simple ground line, centered, generous open cornflower-blue space around. EXACTLY ONE PERSON." ;;
b09_real)
  gen "m07_L7A_b09_real.png" "$A/jim.png" "$JIM" "EXACTLY ONE person: JIM standing, genuinely thoughtful, one hand resting on his chest, sincere considering expression as if raising a real, honest concern. Open and serious, not defensive. Standing on a simple ground line, centered, generous open cornflower-blue space around. EXACTLY ONE PERSON." ;;
b12_doorway)
  gen "m07_L7A_b12_doorway.png" "$A/jim.png" "$JIM" "EXACTLY ONE person: JIM stepping through a large open doorway, mid-stride, one foot through, reaching a hand forward, hopeful forward-looking expression. The open doorway is a simple bold door frame with the door swung wide, warm cream light spilling through it from the far side. Centered, generous open cornflower-blue space around. EXACTLY ONE PERSON." ;;
*) echo "unknown key $1"; exit 1 ;;
esac
