#!/bin/zsh
# Lesson 7B — Objection Scripts Playbook. One lane per image:
#   zsh scripts/gen_stills_7B.sh <key>
# Category-theme dividers (later Seedance-animated). LOCKED CAST (Jarrad 2026-07-05):
#   BMH rep = ANDREA (female, black ponytail, orange headset) — anchor _anchors/rep_andrea.png
#   seller  = man with bushy black hair, NO headset          — anchor _anchors/seller_male.png
# Only Andrea wears the headset; never swap roles.
set -u
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
D="docs/design"
OUT="course-assets/scenes/module-07-lesson7B"
AN="$OUT/_anchors"
LOG="$OUT/_logs"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. NEVER add sweat drops, motion lines, speed lines, shock marks, thought bubbles, or any floating emphasis symbols — only the described subjects. 16:9 composition, 1600x900.'

CAST='CAST — match the attached character anchors EXACTLY (identical face, hair, and palette): the BMH representative is ANDREA — a woman with black hair in a PONYTAIL wearing an orange phone headset. The seller is the man with bushy black curly hair and NO headset. ONLY Andrea ever wears the headset; the seller never wears one. Do not swap their roles.'

STYLEREFS=(-i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png")
REP=(-i "$AN/rep_andrea.png")
SELLER=(-i "$AN/seller_male.png")

gen() {
  local file="$1"; local desc="$2"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached STYLE references for the art style and the CHARACTER anchors for the people. COMPOSITION: $desc $CAST $STYLE" | \
  codex exec "${REFS[@]}" --skip-git-repo-check --sandbox workspace-write > "$LOG/$file.log" 2>&1
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file (see $LOG/$file.log)"
}

case "$1" in
theme_price)
  REFS=("${STYLEREFS[@]}" "${REP[@]}" "${SELLER[@]}")
  gen "m07_L7B_theme_price.png" "Andrea (the BMH rep) and the seller seated across a small simple table, mid-negotiation, both leaning in slightly, engaged but easygoing. The tabletop between them is empty — nothing on the table. A small simple house in the background." ;;
theme_competition)
  REFS=("${STYLEREFS[@]}" "${REP[@]}" "${SELLER[@]}")
  gen "m07_L7B_theme_competition.png" "The seller stands in front of one simple house looking a little overwhelmed as THREE other generic investor/agent characters (varied looks, none of them Andrea, none of them the seller, and NONE wearing a headset) crowd in from the sides, each reaching a hand toward the house — one holding a briefcase, one holding a small blank sign, one waving a blank document. Off to one side, Andrea (the BMH rep) waits calm and confident with relaxed arms, not crowding." ;;
theme_delay)
  REFS=("${STYLEREFS[@]}" "${SELLER[@]}")
  gen "m07_L7B_theme_delay.png" "The seller stands centered, one palm raised out in a calm 'hold on, not yet' gesture, easygoing expression. Beside him stands one big simple round wall clock. No headset, no other people. Patient, stalling, buying-time mood." ;;
theme_trust)
  REFS=("${STYLEREFS[@]}" "${REP[@]}" "${SELLER[@]}")
  gen "m07_L7B_theme_trust.png" "A house front door opened just a crack with a simple door chain still latched across the narrow gap. The seller peeks through the opening with a wary, skeptical, sizing-you-up look. Outside on the step, Andrea (the BMH rep) stands offering an open hand for a handshake and holding a single blank document. Cautious, guarded mood." ;;
theme_asis)
  REFS=("${STYLEREFS[@]}" "${REP[@]}" "${SELLER[@]}")
  gen "m07_L7B_theme_asis.png" "A slightly worn simple house in the center — a couple of visible wall cracks and one boarded-over window. In front, Andrea (the BMH rep) stands with both palms up in an easygoing 'no repairs needed' gesture; a closed toolbox sits unopened on the ground beside her. The seller stands nearby, reassured. Relaxed, take-it-as-it-is mood." ;;
theme_distress)
  REFS=("${STYLEREFS[@]}" "${REP[@]}" "${SELLER[@]}")
  gen "m07_L7B_theme_distress.png" "A simple house sitting low with its bottom third submerged in flat stylized blue water. The seller stands on the roof looking worried. On dry ground at the side, Andrea (the BMH rep) tosses a round life-ring on a rope toward the house. NO motion lines, NO speed lines, NO shock or emphasis marks, NO floating symbols of any kind — only the characters, the house, the water, the life-ring, and the ground." ;;
*) echo "unknown key $1"; exit 1 ;;
esac
