#!/bin/zsh
# Lesson 12A stills — one lane per image: zsh gen_stills_12A.sh <key>
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
D="docs/design"
OUT="course-assets/scenes/module-12"
A="course-assets/scenes/module-12/_anchors"
mkdir -p "$OUT"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only from the locked five-color palette: cornflower blue #62b3f3, sunflower yellow, tangerine orange, pale cream/warm white, and black. Faces and hands are flat white/cream only, no peach/tan/brown skin tones. Faces match the attached cast board: small dot eyes, a small subtle curved nose like a tiny hook/comma line, simple small mouth. Cylindrical limbs, strong simple silhouettes, icon-level detail, confidently imperfect hand-drawn shapes. Single flat cornflower-blue background. No gradients, no texture, no shadows, no lighting, no perspective depth. No ambient doodles: no hearts, sparkles, music notes, thought bubbles, speech bubbles, decorative clouds, motion ticks, or random filler marks. No text, words, letters, numbers, icons, UI labels, or charts baked into the image; all labels and KPI numbers will be code-rendered later. 16:9 wide composition, 1600x900, the whole scene fully in frame with even blue margin and nothing clipped.'
NEG='NEGATIVE: no duplicate people, no clone, no extra characters beyond the requested count, no photorealism, no 3D, no vector-polished look, no readable text, no logos, no watermarks, no charts with labels, no skin-tone shading.'

gen() {
  local file="$1"; local desc="$2"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached BMH course doodle references exactly. COMPOSITION: $desc $STYLE $NEG" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" -i "$D/object-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -12
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

gen_priya() {
  local file="$1"; local desc="$2"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached BMH course doodle references exactly and keep PRIYA identical to the attached Priya reference. PRIYA: BMH follow-up representative woman, black back ponytail, orange/yellow headband, orange headset with boom mic, yellow top, cream pants, orange shoes, flat white/cream face, small dot eyes, tiny curved cast-board nose, simple friendly mouth. COMPOSITION: $desc $STYLE $NEG" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" -i "$D/object-board.png" -i "$A/priya.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -12
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

gen_priya_white() {
  local file="$1"; local desc="$2"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached BMH course doodle references exactly and keep PRIYA identical to the attached Priya reference. PRIYA: BMH follow-up representative woman, black back ponytail, orange/yellow headband, orange headset with boom mic, yellow top, cream pants, orange shoes, PURE FLAT WHITE face and hands only, never cream, never peach, never tan, never gray, never pink, never brown, no skin-tone shading, small dot eyes, tiny curved cast-board nose, simple friendly mouth. COMPOSITION: $desc $STYLE NEGATIVE OVERRIDE FOR THIS IMAGE: face and hands must not be cream/warm white; no cream skin, no peach skin, no tan skin, no gray skin, no pink skin, no brown skin. $NEG" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" -i "$D/object-board.png" -i "$A/priya.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -12
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
b04)
  gen "m12_L12A_b04_flying-blind.png" "One BMH-style follow-up rep seated at a simple desk, working calls with a phone handset and a small stack of lead cards. In front of the rep is a large BLANK dashboard monitor angled toward them; the screen is plain cream/white with absolutely no text, no numbers, and no chart markings, implying they are not checking performance. The rep looks busy but slightly uncertain, surrounded only by necessary desk props: phone base, lead cards, pen. Centered composition with the person and blank dashboard clearly readable. EXACTLY ONE PERSON." ;;
b04_priya)
  gen_priya "m12_L12A_b04_flying-blind_priya.png" "PRIYA seated at a simple desk, working calls with a phone handset in one hand and a small stack of blank lead cards near the other hand. In front of Priya is a large BLANK dashboard monitor angled toward her; the screen is plain cream/white with absolutely no text, no numbers, no icons, and no chart markings, implying she is not checking performance. She looks busy but slightly uncertain. Necessary desk props only: phone base, blank lead cards, pen, and the blank monitor. Centered composition with Priya and the blank dashboard clearly readable. EXACTLY ONE PERSON." ;;
b04_blind)
  gen_priya "m12_L12A_b04_flying-blind_priya-cane.png" "PRIYA seated at a simple call desk, working calls while metaphorically 'flying blind': she wears dark black sunglasses over her eyes and holds a simple white mobility cane / walking stick with one hand, while a phone handset and phone base sit on the desk. In front of Priya is a large BLANK dashboard monitor angled toward her; the screen is plain cream/white with absolutely no text, no numbers, no icons, and no chart markings. Add a small stack of blank lead cards and a pen on the desk. The image should read as 'she is calling but cannot see the numbers.' Necessary props only. Centered composition with Priya, sunglasses, cane, phone, and blank dashboard clearly readable. EXACTLY ONE PERSON." ;;
b04_cane)
  gen_priya "m12_L12A_b04_flying-blind_priya-cane.png" "PRIYA seated at a simple call desk, holding a phone handset near her headset and wearing dark black sunglasses. A long simple WHITE guide cane / walking stick leans clearly against the desk beside her hand as a visual metaphor for not seeing the numbers. In front of Priya is a large BLANK dashboard monitor angled toward her; the screen is plain cream/white with absolutely no text, no numbers, no icons, and no chart markings. Add a small stack of blank lead cards and a pen on the desk. Necessary props only. Centered composition with Priya, sunglasses, cane, phone, and blank dashboard clearly readable. EXACTLY ONE PERSON." ;;
b04_standing_cane)
  gen_priya "m12_L12A_b04_flying-blind_priya-standing-cane.png" "PRIYA standing in open space, wearing dark black sunglasses and holding a long simple WHITE guide cane / walking stick angled in front of her. She wears her orange headset with boom mic, one hand lightly touching the headset as if taking calls. Keep the scene sparse: only Priya and the walking stick. No desk, no chair, no table, no computer, no monitor, no dashboard screen, no laptop, no phone base, no papers. The image should read as metaphorical 'flying blind' while doing calls. Centered composition, full body visible, EXACTLY ONE PERSON." ;;
b07)
  gen "m12_L12A_b07_dial-quality.png" "One BMH-style follow-up rep at a desk late in the day, hurriedly tapping a phone and flipping through a call list. A simple round wall clock behind the desk points near 4 o'clock using only hands and tick marks, no numerals. The rep's posture shows rushed speed-dialing, not a real conversation: shoulders forward, one hand tapping the phone, other hand on the list. Keep the call list as blank paper lines with no text. Centered composition, plain blue background, necessary props only. EXACTLY ONE PERSON." ;;
b07_priya)
  gen_priya "m12_L12A_b07_dial-quality_priya.png" "PRIYA at a desk late in the day, hurriedly pressing random buttons on a desk phone keypad while blank call-list documents spill/drop onto the desk. A simple round wall clock behind the desk points near 4 o'clock using only hands and tick marks, no numerals; compose it so the clock can later animate with fast-spinning hands. Priya's posture shows rushed speed-dialing, not a real conversation: shoulders forward, one hand tapping the phone, other hand releasing the blank papers. The call list documents are blank paper lines with no text. Centered composition, plain blue background, necessary props only. EXACTLY ONE PERSON." ;;
b07_priya_front)
  gen_priya_white "m12_L12A_b07_dial-quality_priya-front.png" "PRIYA seated at a simple desk facing the viewer in a front three-quarter view. Her face and hands are PURE FLAT WHITE ONLY, not cream, not peach, not tan, not gray, not pink, not brown, no shading. She urgently presses random buttons on a desk phone. The phone keypad faces upward and toward Priya and the viewer, clearly readable as a keypad surface; it must NOT face away and must NOT point away from her. Several blank call-list documents are on the desk facing Priya and the viewer, angled toward the camera with blank line marks only; they must NOT face away and must NOT point away from the viewer. A simple round wall clock is behind her, with only hands and tick marks, no numerals. Keep the clock unobstructed so its hands can animate fast later. Centered composition, plain blue background, necessary grounded props only. EXACTLY ONE PERSON." ;;
b07_priya_docdrop)
  gen_priya "m12_L12A_b07_dial-quality_priya-docdrop.png" "PRIYA at a simple desk late in the day, leaning forward and pressing random buttons on a desk phone keypad. Several blank call-list papers have just dropped onto the desk and are spread near the phone. A simple round wall clock is clearly visible on the back wall near 4 o'clock, with only hands and tick marks, no numerals. Leave the clock unobstructed so its hands can animate fast later. The papers are blank with simple line marks only, no words, no letters, no numbers. Centered composition, necessary props only. EXACTLY ONE PERSON." ;;
b11)
  gen "m12_L12A_b11_offers-made.png" "A clean acquisition-side offer desk scene with NO people. On the desk: a neat blank lead packet folder entering from the left, a simple calculator, a property photo represented by a plain little house drawing with no labels, and one blank official offer sheet sitting on the right with only generic horizontal pseudo-lines, no text or numbers. The arrangement should read as a qualified lead being reviewed and turned into an offer. Leave generous open blue space around the desk so code-rendered offer counters can overlay later." ;;
b16)
  gen "m12_L12A_b16_coaching-review.png" "Two BMH-style people seated side by side at a simple review table, calmly looking together at a laptop screen with a blank waveform-style row and empty dashboard panels. One is a manager/coach pointing gently at the laptop, the other is a follow-up rep listening with a thoughtful expression. The mood is collaborative coaching, not punishment. Laptop content must be abstract blank shapes only: no readable text, no numbers, no labels. Composition leaves the bottom-right corner area mostly open blue for an Andrea circle overlay. EXACTLY TWO PEOPLE, no extras." ;;
b16_reportcard)
  gen "m12_L12A_b16_report-card.png" "A single large report-card sheet on a plain cornflower-blue background, centered and slightly tilted like a physical paper card. The report card is warm white/cream with a thick black outline and several blank horizontal rows and empty rounded boxes, like a scorecard template, but absolutely no words, letters, numbers, grades, labels, symbols, checkmarks, or icons. Add only one simple orange pencil lying beside the report card and one small yellow tab clipped to the top edge. Clean, minimal, readable as a report card or scorecard for coaching. NO PEOPLE." ;;
*) echo "unknown key $1"; exit 1 ;;
esac
