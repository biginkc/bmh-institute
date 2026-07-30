#!/bin/zsh
# Lesson 4A wordless vignette stills — one lane per image: zsh gen_stills_4A.sh <key>
# Fire each key as its own background bash call (all lanes in one turn).
set -u
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
D="docs/design"
OUT="course-assets/scenes/module-04"
mkdir -p "$OUT"
STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. No floating hearts, sparkles, notes, thought bubbles, or motion marks. 16:9 composition, 1600x900.'

gen() {
  local file="$1"; local desc="$2"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: $desc $STYLE" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
capture)
  gen "m04_L4A_v1_capture.png" "A single incoming-lead info card floating down into an open CRM inbox tray. The card shows a small simple person-head silhouette icon in the top corner and three short blank horizontal dash-lines beneath it (NO readable words). Below, an open shallow tray or in-box catches the card. Objects only, no people. Centered, generous open cornflower-blue space around. Nothing else in frame." ;;
firstcontact)
  gen "m04_L4A_v2_firstcontact.png" "EXACTLY ONE friendly doodle person making a first phone call: a smartphone held to one ear, the other hand raised in a natural talking gesture near the shoulder, warm approachable expression. Two or three small curved signal arcs rise from the phone to suggest an outgoing call. Standing on a simple ground line, centered. EXACTLY ONE PERSON, no clone, no second person. Nothing else in frame." ;;
qualify)
  gen "m04_L4A_v3_qualify.png" "A doodle clipboard standing on the LEFT holding a short checklist of three or four green checkmark ticks (checkmarks ONLY, NO words), and on the RIGHT a small simple one-story house with a magnifying glass held over it as if inspecting it. Objects only, no people. Balanced composition on a simple ground line, generous open cornflower-blue space above. Nothing else in frame." ;;
discovery)
  gen "m04_L4A_v4_discovery.png" "EXACTLY TWO doodle people seated across from each other in a warm, genuine conversation, both leaning slightly toward each other, one listening intently with a caring expression, the other speaking openly. A sense of real trust and connection. Seated on simple chairs on a ground line, centered, generous open cornflower-blue space above. EXACTLY TWO people, no third person, no clone. Nothing else in frame." ;;
handoff)
  gen "m04_L4A_v6_handoff.png" "EXACTLY TWO doodle people making a clean hand-off. On the LEFT, a BMH representative wearing a cap holds out a closed file folder and passes it across to the RIGHT, where an acquisition manager in a different-colored outfit reaches out to receive it. Both steady, professional, both hands meeting on the folder in the center. Simple ground line, centered. EXACTLY TWO people, no third person, no clone. Nothing else in frame." ;;
offer)
  gen "m04_L4A_v7_offer.png" "EXACTLY ONE doodle homeowner seated, thoughtfully reviewing a single offer document held in both hands, reading it with a considering, hopeful expression. A single small dollar-sign symbol appears on the page (that ONE symbol is the only mark; no other text or words). Seated on a chair on a simple ground line, centered, generous open cornflower-blue space around. EXACTLY ONE PERSON, no clone. Nothing else in frame." ;;
contract)
  gen "m04_L4A_v8_contract.png" "A doodle contract document lying flat, centered, with a single signature squiggle line near the bottom and a pen resting mid-signature on that line. In one corner, a tiny simple handshake icon. Objects only, no people. The only marks are the squiggle signature line and the small handshake icon; no readable words. Generous open cornflower-blue space around. Nothing else in frame." ;;
*) echo "unknown key $1"; exit 1 ;;
esac
