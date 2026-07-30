#!/bin/zsh
# Lesson 18A v2 correction stills.
set -u
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
SELF="${0:A}"

D="docs/design"
OUT="course-assets/scenes/module-18-lesson18A"
A="$OUT/_anchors"
LOG="$OUT/_logs"
mkdir -p "$OUT" "$A" "$LOG"

PRIYA_REF="$A/operator-priya.png"
ANDREA_REF="course-assets/avatar-candidates/andrea_headset_v2.png"

REFS=(
  "$D/style-ref-1.png"
  "$D/style-ref-2.png"
  "$D/cast-board.png"
  "$D/object-board.png"
  "$PRIYA_REF"
  "$ANDREA_REF"
)

for ref in "${REFS[@]}"; do
  if [ ! -f "$ref" ]; then
    echo "MISSING REF: $ref" >&2
    exit 1
  fi
done

STYLE='STYLE: flat sticker-sheet doodle illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only in the locked palette: cornflower-blue #62b3f3 background, yellow #FFD23F, orange, cream #FFF7DE, white, and black. No gradients, no texture, no shading, no shadows, no lighting, no perspective, no skin-tone shading. Faces and hands use flat white or cream fill only, tiny dot eyes, a small subtle curved cast-board nose like a tiny hook/comma, simple mouth. Cylindrical limbs, strong simple silhouettes, confidently imperfect hand-drawn. No ambient doodles: no hearts, sparkles, notes, thought bubbles, speech bubbles, motion marks, random icons, random props, or decorative clutter. No text, letters, words, numbers, labels, captions, UI labels, readable screens, readable messages, readable paperwork, real app logos, or screenshots anywhere. Use blank app-like panes, blank cards, blank rows, blank message bubbles, blank check boxes, and blank pseudo-lines only. Leave clean open cornflower-blue space for code-rendered Remotion labels. 16:9 composition, 1600x900 PNG.'

PRIYA='PRIYA / BMH representative identity: same exact woman as the attached operator-priya reference, black back ponytail, orange/yellow headband, orange headset with boom mic, yellow top, cream pants, orange shoes, flat white/cream face and hands, small dot eyes, tiny curved cast-board nose, simple friendly mouth.'
ANDREA='ANDREA identity: same exact Andrea narrator as the attached Andrea reference and cast board, black curly hair/headset identity, flat white/cream face and hands, dot eyes, tiny curved cast-board nose, simple mouth.'
NEG='NEGATIVE: no duplicate people, no extra characters beyond the requested count, no skin-tone colors, no brown/tan/peach/pink cheeks, no readable text, no logos, no watermarks, no realistic UI, no decorative filler, no clutter, no clipped subject.'

gen_priya() {
  local file="$1"
  local desc="$2"
  local log="$LOG/$file.v2.log"
  echo "=== GEN $file ==="
  {
    echo "Generate one corrected Lesson 18A v2 image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached BMH course doodle references exactly. $PRIYA COMPOSITION: $desc $STYLE $NEG"
  } | codex exec \
    -i "$D/style-ref-1.png" \
    -i "$D/style-ref-2.png" \
    -i "$D/cast-board.png" \
    -i "$D/object-board.png" \
    -i "$PRIYA_REF" \
    --skip-git-repo-check \
    --sandbox workspace-write \
    > "$log" 2>&1

  if [ -f "$OUT/$file" ]; then
    echo "OK $file"
  else
    echo "MISSING $file (see $log)" >&2
    return 1
  fi
}

gen_andrea() {
  local file="$1"
  local desc="$2"
  local log="$LOG/$file.v2.log"
  echo "=== GEN $file ==="
  {
    echo "Generate one corrected Lesson 18A v2 image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached BMH course doodle references exactly. $ANDREA COMPOSITION: $desc $STYLE $NEG"
  } | codex exec \
    -i "$D/style-ref-1.png" \
    -i "$D/style-ref-2.png" \
    -i "$D/cast-board.png" \
    -i "$D/object-board.png" \
    -i "$ANDREA_REF" \
    --skip-git-repo-check \
    --sandbox workspace-write \
    > "$log" 2>&1

  if [ -f "$OUT/$file" ]; then
    echo "OK $file"
  else
    echo "MISSING $file (see $log)" >&2
    return 1
  fi
}

run_beat() {
  case "$1" in
    b02)
      gen_priya "m18_L18A_b02_command-center-v2.png" "Morning command-center workstation. Priya sits at a clean desk with laptop and monitor facing HER, not the viewer. The monitor shows a blank follow-up task list with blank rows. Show priority as a simple clean stack of three blank lead folders/cards arranged from hottest/front to colder/back, NOT as stage timeline boxes. Phone/headset base nearby. Exactly one person. No stage labels, no numbers, no rows of empty white boxes floating on the right." ;;
    b03)
      gen_priya "m18_L18A_b03_research-prep-v2.png" "Research-prep desk completely redone. Clean uncluttered desk. Priya works at a laptop/computer that faces her at a natural side angle, not the viewer. The screen shows only blank property/map shapes and blank lead rows. A small neat stack of blank lead cards is beside the computer. No folder pile, no loose card clutter, no laptop screen aimed at camera. Exactly one person." ;;
    b04)
      gen_priya "m18_L18A_b04_first-call-block-v2.png" "A 3x3 grid montage: nine equal rounded panels on one blue canvas. In every panel, the SAME Priya/BMH representative appears on a different phone call with the same headset and outfit, but different gestures and expressions: listening, smiling, focused note-taking, asking a question, checking screen, dialing, thinking, confirming, wrapping up. Same person in all nine frames. No text, no numbers, no captions. The scene reads as several calls in one calling block." ;;
    b05)
      gen_priya "m18_L18A_b05_break-reset-v2.png" "Priya doing a calm yoga/reset stretch on a simple yoga mat on the blue background. Full body visible, centered, no desk. A small water bottle can sit near the mat. Clean, peaceful 15-minute reset scene, not comedy, not office stretching. Exactly one person." ;;
    b09)
      gen_andrea "m18_L18A_b09_pipeline-review-v2.png" "Andrea seen from behind, centered lower in frame, looking up at a very large Wall-Street-style lead ticker board / pipeline board that fills the upper half of the frame. The board has blank ticker rows, blank lead cards, and blank columns only. It should feel like leads moving across a market board, but there must be no readable words, no numbers, no stage labels. Andrea's back faces the camera; she is looking up at the board." ;;
    b12)
      gen_priya "m18_L18A_b12_energy-management-v2.png" "Centered clean energy-management scene. Priya sits centered at a simple clean desk, smiling before dialing with headset on. Laptop and monitor face her naturally; phone and water bottle nearby. No weird blue shade blocks, no white redacted-looking box, no mask-looking rectangles, no clutter, no shoes/card pile, no objects floating on the right. The composition is centered and balanced with one person only." ;;
    all)
      typeset -a pids
      for b in b02 b03 b04 b05 b09 b12; do
        zsh "$SELF" "$b" &
        pids+=($!)
      done
      fail=0
      for pid in "${pids[@]}"; do
        wait "$pid" || fail=1
      done
      exit "$fail"
      ;;
    *)
      echo "usage: $0 {b02|b03|b04|b05|b09|b12|all}" >&2
      return 2
      ;;
  esac
}

run_beat "${1:-}"
