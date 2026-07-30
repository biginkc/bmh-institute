#!/bin/zsh
# Lesson 3A stills — one lane per image: zsh gen_stills_3A.sh <key>
# Fire each key as its own background bash call (all lanes in one turn).
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "${0:A:h}/../../.." && pwd)}"
D="docs/design"
OUT="course-assets/scenes/module-03"
REP="course-assets/avatar-candidates/andrea_headset_v2.png"   # headset-Andrea identity ref
mkdir -p "$OUT"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. 16:9 composition, 1600x900.'
STYLE_NUM='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. The ONLY text allowed is the plain numerals 1 2 3 4; no words anywhere else. 16:9 composition, 1600x900.'
STYLE_TAG='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. The ONLY text allowed is a short name-tag label; no other words anywhere. 16:9 composition, 1600x900.'

# generic gen (style refs only)
gen() {
  local file="$1"; local desc="$2"; local style="${3:-$STYLE}"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: $desc $style" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}
# rep gen (adds the headset-Andrea identity ref for the in-scene rep beats)
genrep() {
  local file="$1"; local desc="$2"
  echo "=== GENREP $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. The woman wearing the phone headset (our BMH representative) must have the IDENTICAL face to the attached headset reference image: tiny dot eyes, small simple nose, simple friendly smile, same headset. COMPOSITION: $desc $STYLE" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" -i "$REP" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
# b02 — family in driveway in front of their house (mom must NOT resemble the Andrea avatar)
family)
  gen "m03_L3A_family-driveway.png" "A doodle family of three — a mother, a father, and one child — standing together in the driveway in FRONT of their modest one-story house, facing forward, calm and hopeful, holding hands. Draw them in the SAME character style as the attached cast-board reference EXACTLY: plain WHITE faces with tiny dot eyes, small nose, simple mouth, NO skin-tone shading of any kind. STRICT 5-COLOR PALETTE ONLY: black, cream/white, yellow, orange (NO brown, NO grey, NO green, NO blonde). ALL THREE have BLACK hair. The mother has BLACK hair in a neat low bun (not big curls, no headset), a cream blouse and yellow pants. The father has short BLACK hair, an orange sweater, cream pants. The child has short black hair and a yellow shirt. The house behind them is cream with an orange roof on a simple ground line. Foreground, centered, open cornflower-blue sky above. EXACTLY three people, no clones. Nothing else in frame." ;;

# b03 — headset-Andrea rep shakes hands with a relieved seller, cash between
handshake)
  genrep "m03_L3A_handshake.png" "A SINGLE simple clean action: on the LEFT, the BMH representative woman wearing a phone headset holds out a neat banded stack of GREEN money bills (money-green dollar bills, object-realism so it reads as real cash) in ONE hand and gives it to a relieved male homeowner on the RIGHT, who reaches out with ONE hand to take it. NO handshake, NO crossed or tangled arms, NO extra hands — each person uses just one arm, reaching toward the cash in the middle. Both standing upright on a simple ground line, warm friendly smiles, plain white faces (no skin tone). EXACTLY two people, no clone, no third person, exactly two arms each. Centered, generous open blue space above. Nothing else in frame." ;;

# b04 — rep with wand (static plate; house swapped disrepair->restored in code)
repwand)
  genrep "m03_L3A_rep-wand.png" "The BMH representative woman wearing a phone headset stands in the LEFT third of the frame, holding up a slim magic wand and pointing it to the RIGHT toward empty space, poised with a pleased confident smile, standing on a simple ground line. The RIGHT two thirds of the frame is completely empty cornflower-blue. EXACTLY ONE PERSON, no clone, no house. Nothing else in frame." ;;
# BIGGER + more elaborate house, filling the CENTER-RIGHT (left ~35% empty for the rep). disrepair + restored MATCH size/position.
disrepair)
  gen "m03_L3A_house-disrepair.png" "A LARGE, detailed two-story cottage in disrepair filling the CENTER-RIGHT of the frame on a simple ground line, its left edge near the middle of the frame and reaching nearly to the right edge, tall and prominent: cream walls with a jagged crack, a sagging crooked orange roof with missing shingle gaps, a small chimney, a covered front porch with a post, TWO windows (one boarded over with crossed planks, one cracked), a plain dull door hanging slightly crooked, a broken gutter. Elaborate but clean flat sticker-doodle, thick uniform black outlines, solid flat fills, NO dithering, NO texture, NO hatching. The LEFT ~35 percent of the frame is completely empty cornflower-blue. No people. Nothing else in frame." ;;
restored)
  gen "m03_L3A_house-restored.png" "A LARGE, detailed two-story cottage freshly restored and cheerful, filling the CENTER-RIGHT of the frame on a simple ground line at the SAME size and position as its rundown version — left edge near the middle of the frame, reaching nearly to the right edge, tall and prominent: straight new orange roof, clean bright cream walls, a small chimney, a welcoming covered front porch with a post, TWO tidy windows with flower boxes, a bright welcoming door, neat trim. Elaborate but clean flat sticker-doodle. The LEFT ~35 percent of the frame is completely empty cornflower-blue. No people. Nothing else in frame." ;;

# b05 — devil-horned agent CLUTCHING a fistful of the seller's cash (yanked away)
devil)
  gen "m03_L3A_devil-agent.png" "A cartoon-villain real estate agent drawn with small devil horns and a pointed devil tail, a sly greedy grin, wearing a blazer, standing on the LEFT and GRIPPING a fat fistful of GREEN money bills TIGHT IN HIS RAISED HAND — the bills are clearly green dollar-bill cash (money-green, object-realism exception so it reads as real money), clutched in his closed fist and pulled toward himself. A worried homeowner on the RIGHT reaches out an open empty hand after the money they just lost, dismayed. The agent wears a small rounded rectangular name tag on the chest that reads REAL ESTATE AGENT. Simple ground line. EXACTLY two people. No other text anywhere except that name tag." "$STYLE_TAG" ;;

# b06 — a foot kicking a REAL doodle clock (readable face: hands, ticks, numerals)
clock)
  gen "m03_L3A_clock-kick.png" "A big round doodle wall clock in the center of the frame with a CLEAR READABLE FACE: a cream face with a thick black rim, twelve short black tick marks around the edge, the numerals 12, 3, 6 and 9 marked, and two black clock hands (a short hour hand and a long minute hand) plus a thin second hand meeting at a center dot. The clock is tipping and tumbling to the RIGHT as a single cartoon leg and orange shoe boots it hard from the LOWER LEFT. A few short motion streak lines behind the clock show it flying, and small curved motion arcs show the hands spinning. The only text is the numerals 12 3 6 9 on the clock face. Nothing else in frame." "$STYLE_NUM" ;;

# b12 — walk-and-talk two-shot: headset rep + seller walking a sidewalk (Seedance start/end frame)
walktalk)
  genrep "m03_L3A_walktalk.png" "A wide two-shot: the BMH representative woman wearing a phone headset walks side by side with a male homeowner along a simple neighborhood sidewalk, both seen from a THREE-QUARTER side view mid-stride (one foot forward, walking), turned slightly toward each other in warm honest conversation. Behind them a simple doodle neighborhood streetscape — a couple of small flat houses, a tree, a lamppost — sits low on the horizon on a cornflower-blue sky, with open blue space above for the camera to move. Both figures are centered, full-body, on a sidewalk ground line. EXACTLY two people, no clone, no third person. Nothing else in frame." ;;

# b07-b11 — four-step doodle roadmap (code lights each stop)
steps)
  gen "m03_L3A_steps-board.png" "A simple winding doodle road/path that travels LEFT to RIGHT across the middle of the frame, gently wavy, cream-colored with a thick black outline. Above the road at FOUR evenly spaced points sit four small icons: (1) a pair of speech bubbles, (2) a magnifying glass held over a tiny house, (3) a small offer document with a folded corner, (4) a house key crossed with a tiny handshake. IMPORTANT: draw ONLY the road and the four icons — do NOT draw any circles, dots, badges, or numbers on the road (those are added separately later). Clean, evenly balanced, generous blue margins. NO text or numerals anywhere. Nothing else in frame." ;;

# b12 — bandaged BMH figure shouldering the repair/risk burden
injury)
  gen "m03_L3A_injury.png" "ONE cast-board-style BMH worker figure wearing a cap, hunched forward under a heavy load, a bandage plaster on one forearm and a small bandage on one cheek, strained but steady determined expression. On their back they carry a bundled load of burdens roped together: a large wrench, a round clock, and a yellow triangular hazard sign. EXACTLY ONE PERSON, no clone. Centered, generous open blue space. Nothing else in frame." ;;

# b14 — relieved homeowner, weight lifted
peace)
  gen "m03_L3A_peace.png" "ONE cast-board-style homeowner standing easy and relieved on the LEFT, in front of THEIR house on the RIGHT which has a small yard sign reading SOLD staked in front of it. The person's shoulders are relaxed, a soft peaceful smile, one open hand gesturing warmly toward the sold house, the other hand resting in a pocket. Plain white face, no skin tone. Palette only: black, cream, yellow, orange, white. Keep the upper-left area EMPTY open blue — do NOT add any floating boxes, weights, dumbbells, motion marks, or objects. The ONLY text is the word SOLD on the sign. EXACTLY ONE PERSON, no clone. Simple ground line, open blue above and around. Nothing else in frame." "$STYLE_TAG" ;;

# b15 + b16 — blank whiteboard/easel (formula + numbers rendered later in code)
board)
  gen "m03_L3A_whiteboard.png" "A simple doodle whiteboard on a two-leg easel stand, centered in the frame, with a completely BLANK white writing surface — NO text, NO numbers, NO marks, NO logo, NO icon, NO house anywhere on or around the board. Just an empty clean whiteboard on its easel. Generous open cornflower-blue space around the easel. Nothing else in frame." ;;

# b17 — headset-Andrea rep on the phone, modeling the answer
phone)
  genrep "m03_L3A_phone.png" "The BMH representative woman wearing a phone headset stands CENTERED in the middle of the frame, calm and confident mid phone-call, one hand raised in a natural friendly talking gesture near her shoulder, warm smile. Symmetric composition with equal open cornflower-blue space on the left and right. EXACTLY ONE PERSON, no clone. Nothing else in frame." ;;

*) echo "unknown key $1"; exit 1 ;;
esac
