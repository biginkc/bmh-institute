#!/bin/zsh
# Lesson 18B stills — run one lane per image or `all`.
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "${0:A:h}/../../.." && pwd)}"

D="docs/design"
OUT="course-assets/scenes/module-18-lesson18B"
LOG="course-assets/scenes/module-18-lesson18B/_logs"
mkdir -p "$OUT" "$LOG"

REFS=(
  "$D/style-ref-1.png"
  "$D/style-ref-2.png"
  "$D/cast-board.png"
  "$D/object-board.png"
  "course-assets/scenes/module-04-lesson4B/m04_L4B_v4b_offer_handoff_animated_base.png"
  "course-assets/scenes/module-04-lesson4B/m04_L4B_v5_rep_closeup_headset.png"
  "course-assets/scenes/module-04-lesson4B/m04_L4B_v6_pipeline_board_call_composite.png"
)

for ref in "${REFS[@]}"; do
  if [ ! -f "$ref" ]; then
    echo "MISSING REF: $ref" >&2
    exit 1
  fi
done

STYLE='STYLE: flat sticker-sheet doodle illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only in the locked palette: cornflower-blue #62b3f3 background, yellow, orange, cream, white, and black. No gradients, no texture, no shadows, no lighting, no perspective, no skin-tone shading. Faces and hands use flat white/cream fill, tiny dot eyes, a small subtle curved cast-board nose, simple mouth. Cylindrical limbs, strong simple silhouettes, confidently imperfect hand-drawn. No ambient doodles: no hearts, sparkles, notes, thought bubbles, speech bubbles, motion marks, random icons, random props, or decorative clutter. No real app logos. No text, letters, words, numbers, labels, captions, UI labels, readable messages, or readable paperwork anywhere; all Slack/Sandra/DialPad/Gmail labels and county names will be code-rendered later with Sticker overlays. Use blank app-like panes, blank message bubbles, blank channel rows, blank cards, and blank pseudo-lines only. Leave clean open cornflower-blue space for code-rendered Sticker overlays. 16:9 composition, 1600x900 PNG.'

gen() {
  local file="$1"
  local desc="$2"
  local log="$LOG/$file.log"
  echo "=== GEN $file ==="
  {
    echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references and cast-board character style exactly. COMPOSITION: $desc $STYLE"
  } | codex exec \
    -i "$D/style-ref-1.png" \
    -i "$D/style-ref-2.png" \
    -i "$D/cast-board.png" \
    -i "$D/object-board.png" \
    -i "course-assets/scenes/module-04-lesson4B/m04_L4B_v4b_offer_handoff_animated_base.png" \
    -i "course-assets/scenes/module-04-lesson4B/m04_L4B_v5_rep_closeup_headset.png" \
    -i "course-assets/scenes/module-04-lesson4B/m04_L4B_v6_pipeline_board_call_composite.png" \
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

case "${1:-}" in
  b02)
    gen "m18_L18B_b02_county-channels.png" "County geography scene in the approved BMH course doodle style, matching the attached Lesson 4B stills more than any clean diagram. Plain cornflower-blue field. Center: a loose hand-drawn cream paper map sheet, like a simple training prop sitting on the blue field, with a recognizable Missouri-like outline drawn by hand on the paper. Inside the outline are simple county-like sections separated by wobbly black hand-drawn lines; several sections are shaded yellow or orange, others cream/white. It should read immediately as a map with counties, not a blob, not a nugget, not a grid, not a vector icon, not a dashboard, not a UI panel. No Slack list, no cards, no sidebar, no labels, no pins, no roads, no real GIS details, no text, no people. Keep the look imperfect, organic, and course-illustration-like with thick wobbly black outlines and flat fills only." ;;
  b03)
    gen "m18_L18B_b03_approval-flow.png" "Outbound approval flow scene on a plain cornflower-blue field. LEFT: a blank county-channel pane with one blank draft message card. CENTER: a manager review desk with one manager character calmly reviewing the blank card with a pen. RIGHT: two blank outbound-tool tiles represented only as generic rounded rectangles with small blank device/mail shapes, no words, no logos. A simple path of blank cards moves left to right from draft to review to send. Exactly one person total. Keep upper third open for later code labels." ;;
  b04)
    gen "m18_L18B_b04_quality-check.png" "Quality-check scene in the approved BMH course doodle style. Plain cornflower-blue field with only two people and one review prop. LEFT: the BMH representative with headset, black ponytail/headband, yellow top, flat white face and hands. RIGHT: the manager/reviewer in orange top holding a simple blank clipboard. Between them, or held by the manager, one large hand-drawn magnifying glass clearly signals quality review. No background board, no message draft card, no checklist panel, no approval badge, no arrows, no UI cards, no envelopes, no desk, no table, no screen, no decorative props, no ambient doodles. White skin fill only. No text, no logos, no readable writing. Keep the composition sparse with lots of blue background." ;;
  b05)
    gen "m18_L18B_b05_handoff-thread.png" "Contained handoff-thread scene on a plain cornflower-blue field. A large blank Slack-style thread card sits inside a blank county-channel pane, with one compact blank handoff-summary card nested inside it. To the side is a separate blank Sandra-notes panel represented by a clean CRM card with blank field rows. Small blank tag chips connect the thread card to two simple teammate avatar dots, but no letters or names. No real logos. No readable text. No private data. No people, just clean workflow cards and avatar dots. Keep bottom-center open for later code overlays." ;;
  b06)
    gen "m18_L18B_b06_sandra-packet.png" "Sandra CRM handoff packet scene on a plain cornflower-blue field. Center: a large blank CRM profile panel with a visible checklist structure: multiple blank rows, blank field boxes, and a blank section stack. A small blank stage marker tab sits at the top, but contains no letters or numbers. On the side, a neat blank folder or lead packet overlaps the panel. No real app logo, no screenshots, no text, no numbers. No people. Leave room around the panel for code-rendered checklist labels later." ;;
  b07)
    gen "m18_L18B_b07_dual-handoff.png" "Dual communication workflow scene on a plain cornflower-blue field. LEFT: a completed blank CRM packet panel with several blank check rows. RIGHT: a blank notification card inside a blank Slack-style channel pane. A thick simple bridge line connects both sides into a central handoff tray, where one blank lead packet sits securely so nothing can fall through. No words, no app logos, no readable UI. No people. Keep top and bottom-center open for code labels." ;;
  b08)
    gen "m18_L18B_b08_response-loop.png" "Seller response triage loop on a plain cornflower-blue field. Center: one incoming blank message card with a small phone/email symbol shape but no logo or letters. Four simple blank lanes branch from it: a blank CRM panel, a blank county-channel pane, a blank tag/help card, and a blank callback calendar/phone card. Use arrows or path lines without arrow labels. No text, no numbers, no app logos. No people. The loop should read as organized response handling, not chaos." ;;
  b09)
    gen "m18_L18B_b09_daily-standup.png" "Daily standup board on a plain cornflower-blue field. Center: a large blank Slack-style channel card with exactly five short blank line slots stacked vertically, each line represented by a cream rounded bar with no words. Along the bottom: three small simple teammate avatar circles reviewing the board, drawn in cast-board style but small and clean. No text, no numbers, no app logos. Keep the board readable and uncluttered, with enough open blue for code labels." ;;
  b10)
    gen "m18_L18B_b10_ask-manager.png" "Manager escalation scene on a plain cornflower-blue field. LEFT: a blank county-channel pane contains one highlighted blank tricky-case card and a blank manager tag chip with no letters. RIGHT: a calm BMH follow-up representative with headset continues working a small queue of blank lead cards at a desk while waiting for guidance. A manager avatar dot or small manager figure sits near the channel pane, connected by a thin line. Exactly two people maximum, no clones. No text, no numbers, no logos. The feeling is calm ask-for-help workflow, not panic." ;;
  b12)
    gen "m18_L18B_b12_wins-momentum.png" "Team win momentum scene on a plain cornflower-blue field. Center: a blank team channel board with one larger blank celebration post card and two smaller blank win cards, all with no words. Around it are three BMH-style team members smiling professionally and looking at the board, restrained celebration with one small raised hand or nod, no confetti, no sparkles, no hearts. A simple upward momentum meter shape appears beside the board with no numbers or labels. Exactly three people total. Keep top-center open for code labels." ;;
  all)
    zsh "$0" b02 &
    pids=($!)
    zsh "$0" b03 &
    pids+=($!)
    zsh "$0" b04 &
    pids+=($!)
    zsh "$0" b05 &
    pids+=($!)
    zsh "$0" b06 &
    pids+=($!)
    zsh "$0" b07 &
    pids+=($!)
    zsh "$0" b08 &
    pids+=($!)
    zsh "$0" b09 &
    pids+=($!)
    zsh "$0" b10 &
    pids+=($!)
    zsh "$0" b12 &
    pids+=($!)
    fail=0
    for pid in "${pids[@]}"; do
      wait "$pid" || fail=1
    done
    exit "$fail"
    ;;
  *)
    echo "usage: $0 {b02|b03|b04|b05|b06|b07|b08|b09|b10|b12|all}" >&2
    exit 2
    ;;
esac
