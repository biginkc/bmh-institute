#!/bin/zsh
# Lesson 18A stills — run one lane per image or `all`.
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"

D="docs/design"
OUT="course-assets/scenes/module-18-lesson18A"
A="$OUT/_anchors"
LOG="$OUT/_logs"
mkdir -p "$OUT" "$A" "$LOG"

PRIYA_REF="$A/operator-priya.png"
if [ ! -f "$PRIYA_REF" ]; then
  PRIYA_REF="course-assets/scenes/module-12/_anchors/priya.png"
fi

REFS=(
  "$D/style-ref-1.png"
  "$D/style-ref-2.png"
  "$D/cast-board.png"
  "$D/object-board.png"
  "$PRIYA_REF"
)

for ref in "${REFS[@]}"; do
  if [ ! -f "$ref" ]; then
    echo "MISSING REF: $ref" >&2
    exit 1
  fi
done

STYLE='STYLE: flat sticker-sheet doodle illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only in the locked palette: cornflower-blue #62b3f3 background, yellow #FFD23F, orange, cream #FFF7DE, white, and black. No gradients, no texture, no shading, no shadows, no lighting, no perspective, no skin-tone shading. Faces and hands use flat white/cream fill, tiny dot eyes, a small subtle curved cast-board nose like a tiny hook/comma, simple mouth. Cylindrical limbs, strong simple silhouettes, confidently imperfect hand-drawn. No ambient doodles: no hearts, sparkles, notes, thought bubbles, speech bubbles, motion marks, random icons, random props, or decorative clutter. No text, letters, words, numbers, labels, captions, UI labels, readable screens, readable messages, readable paperwork, real app logos, or screenshots anywhere. Use blank app-like panes, blank cards, blank rows, blank message bubbles, blank check boxes, and blank pseudo-lines only. Leave clean open cornflower-blue space for code-rendered Sticker overlays. 16:9 composition, 1600x900 PNG.'

PRIYA='PRIYA / BMH operator identity: woman follow-up representative, black back ponytail, orange/yellow headband, orange headset with boom mic, yellow top, cream pants, orange shoes, flat white/cream face and hands, small dot eyes, tiny curved cast-board nose, simple friendly mouth. Keep Priya identical to the attached Priya/operator reference and cast board.'

NEG='NEGATIVE: no duplicate people, no extra characters beyond the requested count, no Andrea narrator, no skin-tone colors, no brown/tan/peach/pink cheeks, no readable text, no logos, no watermarks, no realistic UI, no decorative filler, no clutter, no clipped subject.'

gen_priya() {
  local file="$1"
  local desc="$2"
  local log="$LOG/$file.log"
  echo "=== GEN $file ==="
  {
    echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached BMH course doodle references exactly. $PRIYA COMPOSITION: $desc $STYLE $NEG"
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

gen_call() {
  local file="$1"
  local desc="$2"
  local log="$LOG/$file.log"
  echo "=== GEN $file ==="
  {
    echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached BMH course doodle references exactly. $PRIYA SELLER identity for this scene: distinct non-Andrea seller/customer, curly dark hair, orange sweater, cream pants, NO headset, flat white/cream face and hands, small dot eyes, tiny curved cast-board nose, simple attentive mouth. COMPOSITION: $desc $STYLE $NEG"
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

run_beat() {
  case "$1" in
    b02)
      gen_priya "m18_L18A_b02_command-center.png" "Morning command-center workstation. Priya sits normally at a clean desk using a laptop and one larger monitor with a blank Sandra-style CRM task list made of simple blank rows only. Desk has laptop, monitor, phone, and one tidy notepad only. Remove all baked background tile boards, empty card stacks, floating panels, labels, and decorative UI clutter. Leave clean open blue space where code-rendered priority tiles can appear later if needed. EXACTLY ONE PERSON. No readable text, no numbers, no stage labels." ;;
    b03)
      gen_priya "m18_L18A_b03_research-prep.png" "Research-prep scene regenerated from scratch. Priya sits normally at the LONG side of a clean rectangular desk, not at the short end. She faces her laptop; the laptop screen faces Priya and the back of the screen faces the camera. The viewer should not see the laptop screen contents. Desk carries ONLY the laptop plus one tidy notepad or folder. Remove every lead card, property icon, map pin, house icon, paper stack, and card-clutter object. Clean blue background with no baked boards. Cast-board anchored character proportions. EXACTLY ONE PERSON. No readable text, no numbers, no labels." ;;
    b04)
      gen_priya "m18_L18A_b04_first-call-block.png" "First call block. Priya sits normally at a clean desk in an active outbound-calling posture wearing her headset. One hand is near a phone or compact keyboard; the other hand writes on one blank notepad. Desk has only phone, laptop or keyboard, and one notepad. Remove all baked background tile boards, empty call cards, message bubbles, schedule strips, floating panels, and decorative UI clutter. The action should read as focused calling plus immediate note-taking. EXACTLY ONE PERSON. No text or numbers." ;;
    b05)
      gen_priya "m18_L18A_b05_break-reset.png" "Break reset. Priya is away from the active screen, standing beside the desk and stretching calmly while holding or reaching for a simple water bottle. The desk and phone setup are visible in the background but idle: laptop/monitor closed or blank, no active call. Quiet reset mood, no gag, no decorative marks. EXACTLY ONE PERSON." ;;
    b07)
      gen_priya "m18_L18A_b07_admin-block.png" "CRM admin block regenerated from scratch. Priya sits normally at a clean desk typing at a keyboard while facing her monitor. The monitor faces Priya; if visible to camera it is blank or unreadable. Desk has only the monitor, keyboard, phone, and at most one tidy notepad. Remove clipboard, paper piles, pen cup, letter trays, loose papers, handoff trays, baked stage cards, floating panels, and all background tile boards. The scene must read as CRM admin typing, not paperwork sorting. EXACTLY ONE PERSON. No readable text, no numbers, no labels." ;;
    b09)
      gen_priya "m18_L18A_b09_pipeline-review.png" "End-of-day pipeline review. Priya sits normally at a clean desk reviewing one large monitor or simple CRM board surface. Remove all baked empty background tile boards, stage columns, card stacks, floating panels, calendars, and checklist clutter. If stage meaning is needed later it will be code-rendered, so leave clean open blue space for those overlays. Desk has only laptop or keyboard, monitor, phone, and one tidy notepad. The action should read as calm pipeline review and tomorrow planning. EXACTLY ONE PERSON. No text, no labels, no readable UI." ;;
    b12)
      gen_priya "m18_L18A_b12_energy-management.png" "Energy management. Priya sits or stands at a clean workspace smiling before dialing, one hand lightly touching headset, water bottle nearby, phone and laptop ready. Desk has only water bottle, phone, laptop, and at most one tidy notepad. Remove all baked background tile boards, empty card groups, checklists, shoes, path cards, framed scenery, floating labels, and decorative clutter. The scene should read as simple reset and return-to-calls. EXACTLY ONE PERSON." ;;
    b13)
      gen_call "m18_L18A_b13_one-call-humans.png" "Warm phone conversation split scene. Left side: Priya listening carefully with headset at her desk. Right side: a distinct seller/customer on the other side of the call, curly dark hair, orange sweater, cream pants, no headset, holding a simple phone or seated beside a phone. Use a clean split composition or two connected phone panels. The feeling is genuine care and follow-through, not sentimentality. EXACTLY TWO PEOPLE total. No hearts, no speech bubbles, no words, no labels." ;;
    all)
      for b in b02 b03 b04 b05 b07 b09 b12 b13; do
        zsh "$0" "$b" &
        pids+=($!)
      done
      fail=0
      for pid in "${pids[@]}"; do
        wait "$pid" || fail=1
      done
      exit "$fail"
      ;;
    *)
      echo "usage: $0 {b02|b03|b04|b05|b07|b09|b12|b13|all}" >&2
      return 2
      ;;
  esac
}

typeset -a pids
run_beat "${1:-}"
