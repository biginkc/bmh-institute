#!/bin/zsh
# Lesson 1C stills — one lane per image: zsh gen_stills_1C.sh <key>
set -u
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
D="docs/design"
OUT="course-assets/scenes/module-01"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. 16:9 composition, 1600x900.'
STYLE_BMH='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs. Confidently imperfect, hand-drawn. No skin-tone shading. The ONLY text allowed is the three capital letters BMH on the t-shirt — no other letters, numbers, or words anywhere. 16:9 composition, 1600x900.'
STYLE_PRICE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Confidently imperfect, hand-drawn. The ONLY text allowed is the single capital word PRICE as the newspaper headline — all other text areas are blank rounded pseudo-text bars, no other letters, numbers, or words anywhere. 16:9 composition, 1600x900.'

STYLE_CASHOFFER='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs. Confidently imperfect, hand-drawn. No skin-tone shading. The ONLY text allowed is the two capital words CASH OFFER at the top of the document — all other text areas are blank rounded pseudo-text bars, no other letters, numbers, or words anywhere. 16:9 composition, 1600x900.'
STYLE_OFFER='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Confidently imperfect, hand-drawn. The ONLY text allowed is the single capital word OFFER at the top of the document — all other text areas are blank rounded pseudo-text bars, no other letters, numbers, or words anywhere. 16:9 composition, 1600x900.'
STYLE_PRICE_CANYON='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs. Confidently imperfect, hand-drawn. No skin-tone shading. The ONLY text allowed is the single capital word PRICE inside the canyon — no other letters, numbers, or words anywhere. 16:9 composition, 1600x900.'
STYLE_LOGO='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs. Confidently imperfect, hand-drawn. No skin-tone shading. The ONLY text allowed is the B|M|H logo lockup on the t-shirt, reproduced from the attached logo references (serif capitals B M H separated by thin vertical divider bars); its dark green badge background is a permitted brand exception. No other letters, numbers, or words anywhere. 16:9 composition, 1600x900.'

gen() {
  local file="$1"; local desc="$2"; local style="${3:-$STYLE}"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: $desc $style" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

# gen with logo refs appended (b04v2 t-shirt) — endcard = doodle lockup, logo = source mark
genL() {
  local file="$1"; local desc="$2"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: $desc $STYLE_LOGO" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" -i "docs/course-production/remotion/public/lessonA/bmh-endcard.png" -i "/Users/jarradhenry/Sites/bmh-training-videos/public/bmh-logo.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
b02)
  gen "m01_LC_b02_open-line.png" "Split phone-call scene divided by a thin vertical wavy black line. Left half: a cast-board-style rep with a phone headset seated at a small desk, mid-conversation, warm and attentive. Right half: a homeowner standing beside a small simple house, holding a phone to the ear, talking. The two are clearly on a call with each other. Centered, balanced composition." ;;
b03)
  gen "m01_LC_b03_intel.png" "One cast-board-style rep with a phone headset seated in a simple chair, holding a pen and an open notepad, listening attentively with a warm expression. The rep sits in the lower half of the frame, big and centered, with generous open blue space in the upper half (text cards are added later in code). Nothing else in frame." ;;
b04)
  gen "m01_LC_b04_lowballers.png" "A row of three identical investors standing shoulder to shoulder on the left, each in a plain cream shirt with a flat unimpressed expression, arms crossed. Standing clearly apart on the right, our rep: warm smile, waving hello, wearing a white t-shirt with the capital letters BMH hand-drawn on the chest. Ground indicated by a simple line. Nothing else." "$STYLE_BMH" ;;
b05)
  gen "m01_LC_b05_timeline.png" "One large old-fashioned balance scale, perfectly centered and filling most of the frame. Left pan holds a small blank calendar page and a simple round clock face with two hands. Right pan holds one blank price tag with a string. The two pans hang level, balanced. Nothing else in frame, no numbers on the calendar or clock." ;;
b06)
  gen "m01_LC_b06_anchor.png" "Two figures seated at a small round table facing each other. Left: a cast-board-style rep with a phone headset holding a fan of playing cards close to the chest, card backs toward the viewer. Right: a homeowner seated, leaning in slightly, curious. Simple table between them, nothing on it. Centered composition, nothing else." ;;
b07)
  gen "m01_LC_b07_cash-road.png" "A freestanding open doorway in the center foreground, its door swung wide open. Through and beyond the doorway the ground splits into two diverging paths: the left path paved with flat rounded cream cash-bill shapes leading to a small simple house in the distance, the right path a plain dashed road curving away toward the horizon. Centered, nothing else." ;;
b09)
  gen "m01_LC_b09_higher-offer.png" "Two large paper documents standing side by side, filling the frame. Left document: covered in blank rounded pseudo-text bars, tangled in black strings that tie it down to three small heavy weights below it. Right document: clean with blank pseudo-text bars, beside it a neat small stack of flat cash bills and a tiny simple calendar page. No letters or numbers anywhere." ;;
b11)
  gen "m01_LC_b11_movie.png" "A large doodle film clapperboard on the left third of the frame, open jaw up. On the right two-thirds: a simple house with a big front window, and visible through the window a cozy bed with a pillow and blanket. A dashed line arcs from the clapperboard to the house. Nothing else in frame." ;;
b12)
  gen "m01_LC_b12_not-buyer.png" "A tall signpost in the center with three blank arrow signs pointing in different directions. To its left, our cast-board-style rep with a phone headset gestures toward the signs with an open palm, warm expression. To its right, a homeowner looks up at the signs thoughtfully. Ground indicated by a simple line, nothing else." ;;
b13)
  gen "m01_LC_b13_too-high.png" "A small simple house sitting on the ground at the bottom of the frame. From its chimney a long string rises to a huge balloon floating high above, and the balloon is shaped like a price tag: rounded rectangle with a corner hole and string knot, blank face, no numbers. Sky is the flat blue background. Nothing else." ;;
b14)
  gen "m01_LC_b14_align.png" "A cast-board-style rep with a phone headset and a homeowner seated side by side on the SAME side of a small table, both turned slightly toward each other, nodding with warm smiles, the rep making a small open-hand gesture. The other side of the table is empty. Centered composition, nothing else." ;;
b15)
  gen "m01_LC_b15_win-window.png" "One big wall calendar filling most of the frame: a simple month grid of blank rounded day cells, spiral binding at top. A rounded yellow highlight band sweeps horizontally across one row of the grid, like a window of days marked out. No numbers or letters anywhere — labels are added later in code." ;;
b16)
  gen "m01_LC_b16_cash-truth.png" "A path of flat rounded cream cash-bill shapes running diagonally across the frame. A very large magnifying glass with a black handle hovers over the middle of the path, and the bill seen through the round lens appears bigger. Centered, nothing else in frame." ;;
b17)
  gen "m01_LC_b17_perform.png" "Two-part contrast scene. Left: a buyer figure holding a rolled paper contract forward while the other arm is tucked behind the back with fingers visibly crossed, sly expression. Right: our cast-board-style rep with a phone headset in a firm steady handshake with a homeowner, both smiling warmly. A thin vertical wavy line separates the halves. Nothing else." ;;
b18)
  gen "m01_LC_b18_headline.png" "A single doodle newspaper front page filling most of the frame, slightly tilted. At the top, a large hand-drawn headline area with the single capital word PRICE. Below it, two columns of blank rounded pseudo-text bars and one small framed illustration of a simple house inside the page. Nothing else in frame." "$STYLE_PRICE" ;;
b19)
  gen "m01_LC_b19_no-number.png" "A simple doodle car parked in profile, filling the left two-thirds of the frame, with a blank rounded for-sale sign propped inside its side window. To the right in the background, a small simple house. Ground indicated by a simple line. No letters or numbers anywhere." ;;
b21)
  gen "m01_LC_b21_deposition.png" "A road that splits into a fork. At the split stands our cast-board-style rep with a phone headset, pointing clearly down the left path with one arm. A homeowner figure walks away down that pointed path. From the far end of that path, a dashed line arcs high across the sky back around toward the rep, ending in a small arrowhead. Nothing else." ;;
b08v2)
  gen "m01_LC_b08_123-stairs.png" "Three large ascending stairs seen from the side, climbing from lower-left to upper-right and filling most of the frame: three chunky rectangular steps, alternating cream and yellow flat fills, each step clearly taller than the last. A simple small flag planted on the top step. Nothing else in frame, no numbers (step labels are added later in code)." ;;
b07v2)
  gen "m01_LC_b07_cash-road_v2.png" "A freestanding open doorway centered in the frame, its orange door swung wide open. Standing in the doorway, visible through it: a cast-board-style rep wearing a phone headset, smiling warmly, holding a big pile of flat cream cash bills stacked high in both arms. Nothing else in frame." ;;
b04v2)
  genL "m01_LC_b04_lowballers_v2.png" "A row of three investors standing shoulder to shoulder on the left, each with a clearly DIFFERENT look — one tall and thin with straight hair and a cream shirt, one short and round with curly hair and an orange shirt, one medium with a flat-top haircut and a yellow shirt — all with flat unimpressed expressions and crossed arms. Standing clearly apart on the right, our rep: warm smile, waving hello, wearing a white t-shirt with the BMH logo from the last attached reference image reproduced on the chest in the same hand-drawn doodle style. Ground indicated by a simple line. Nothing else." ;;
b09v2)
  gen "m01_LC_b09_higher-offer_v2.png" "A large paper document standing upright on the right side, with the words CASH OFFER written big and hand-drawn at its top and blank rounded pseudo-text bars below. A rope ties the document to the waist of a seller figure who is caught mid-run heading away toward the left edge, leaning forward, arms pumping, with a worried fearful expression, the rope pulled taut behind him. Nothing else in frame." "$STYLE_CASHOFFER" ;;
b16v2)
  gen "m01_LC_b16_cash-truth_v2.png" "A single large paper document centered in the frame with the word OFFER written big and hand-drawn at its top and blank rounded pseudo-text bars below. A very large magnifying glass with a black handle hovers over the middle of the document, and the part seen through the round lens appears enlarged. Nothing else in frame." "$STYLE_OFFER" ;;
b15v2)
  gen "m01_LC_b15_win-window_v2.png" "Three side-by-side doodle month calendars filling the frame, each a cream page with an orange header bar and a 7x5 grid of small blank white day cells with thick wobbly outlines. The three calendars sit in a row like three months of a quarter. All cells completely blank — month names and date numbers are added later in code. Nothing else in frame." ;;
b19car)
  gen "m01_LC_b19_car-plate.png" "The exact same simple doodle car as the attached style: an orange rounded car in full side profile facing right, with a blank rounded cream for-sale sign propped inside its side window, black wheels with cream hubcaps. The car alone, centered, floating on the plain cornflower-blue background — no ground line, no house, nothing else." ;;
b19strip)
  gen "m01_LC_b19_scenery-strip.png" "A long horizontal row of simple doodle scenery along the bottom half of the frame: alternating small houses (cream with orange roofs), round bushes, and simple trees with yellow-orange foliage, evenly spaced on a single ground line running the full width edge to edge. Upper half is empty plain blue. Designed to tile seamlessly: the ground line and spacing continue naturally at both left and right edges." ;;
b07v3)
  gen "m01_LC_b07_cash-road_v3.png" "A freestanding open doorway centered in the frame, its orange door swung wide open. Standing in the doorway, visible through it: our FEMALE rep — black hair in a ponytail, orange phone headset, yellow sweater — smiling warmly, holding up a single BIG oversized bank check with both hands (a wide cream rectangle with blank rounded pseudo-text bars and a blank signature line, no letters or numbers). The check is comically large, nearly as wide as the doorway. Nothing else in frame." ;;
b19carv2)
  gen "m01_LC_b19_car-plate_v2.png" "The exact same simple doodle car as the attached style: an orange rounded car in full side profile facing right, plain empty windows showing nothing inside, black wheels with cream hubcaps. JUST the car and nothing else — no sign, no driver, no ground line, no house — centered, floating on the plain cornflower-blue background." ;;
b19stripv2)
  gen "m01_LC_b19_scenery-strip_v2.png" "A long horizontal row of VARIED doodle scenery along the bottom half of the frame on a single ground line running edge to edge: a tall narrow cream house with an orange roof and round window, then a round bush, then a wide short house with a chimney and two square windows, then a tall tree with round yellow foliage, then a small hut-like house with a big door, then a skinny tree with orange foliage, then a mailbox on a post, then a medium house with a fence segment beside it, then a bushy low tree. Every house a different shape and size, every tree a different silhouette, spacing uneven and natural. Upper half is empty plain blue. The ground line and spacing continue naturally at both left and right edges so the strip tiles seamlessly." ;;
b12v2)
  # image EDIT: current approved still attached as final ref — reproduce exactly, add sign words
  echo "=== GEN m01_LC_b12_not-buyer_v2.png ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/m01_LC_b12_not-buyer_v2.png (PNG, 1600x900). The LAST attached image is the approved final scene. Reproduce it EXACTLY — same signpost, same three arrow signs pointing the same directions, same rep with headset gesturing on the left, same homeowner on the right, same poses, colors and composition — with ONE change only: the three arrow signs now carry hand-lettered black capital words, TOP sign reads AGENT, MIDDLE sign reads WAIT, BOTTOM sign reads RENT, each word centered on its sign in the same wobbly hand-drawn style. STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no shadows. The ONLY text allowed is the three capital words AGENT, WAIT, RENT — one per sign, no other letters, numbers, or words anywhere. 16:9 composition, 1600x900." | \
  codex exec -i "$D/style-ref-1.png" -i "$D/cast-board.png" -i "$OUT/m01_LC_b12_not-buyer.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/m01_LC_b12_not-buyer_v2.png" ] && echo "OK b12v2" || echo "MISSING b12v2" ;;
b17v2)
  gen "m01_LC_b17_perform_v2.png" "Two-part contrast scene. Left: an OLDER buyer man — bald on top with gray hair at the sides, gray bushy eyebrows, slight stoop, cream cardigan over an orange shirt — holding a rolled paper contract forward while the other arm is tucked behind the back with fingers visibly crossed, sly expression. Right: our cast-board-style female rep with a phone headset in a firm steady handshake with a homeowner, both smiling warmly. A thin vertical wavy line separates the halves. Nothing else." ;;
b21canyon)
  gen "m01_LC_b21_canyon.png" "A deep canyon splitting the frame down the middle: two tall yellow-cream cliff walls with wobbly hand-drawn rock edges, a wide empty gap between them dropping below the frame. Standing on the LEFT cliff rim: our cast-board-style female rep — black ponytail, orange phone headset, yellow sweater — facing the gap. Standing on the RIGHT cliff rim: a homeowner in an orange sweater, facing her across the gap. Inside the canyon gap, floating large between the cliff walls: the single hand-lettered black capital word PRICE. Nothing else in frame." "$STYLE_PRICE_CANYON" ;;
*) echo "unknown key $1"; exit 1 ;;
esac
