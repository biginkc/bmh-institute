#!/bin/zsh
setopt pipefail
# Lesson 17 stills — v5.1 board (Jarrad-approved 2026-07-09). Run one lane per image or `all`.
# Fresh-gen beats: b04 your-deal, b05 strong-months, b06 real-outcomes, b09 finish-line (Priya), b10 wallet.
# Reuse (do NOT regen): b02 three-blocks, b03 ramp-calendar, b08 credit-loop, b11 comp-sheet.
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "${0:A:h}/../../.." && pwd)}"

D="docs/design"
OUT="course-assets/scenes/module-17"
LOG="course-assets/scenes/module-17/_logs"
mkdir -p "$OUT" "$LOG"

REFS=(
  "$D/style-ref-1.png"
  "$D/style-ref-2.png"
  "$D/cast-board.png"
  "$D/object-board.png"
)

PRIYA_REFS=(
  "$OUT/_anchors/priya-approved-left-reference-full.png"
  "$OUT/_anchors/priya-approved-left-reference-crop.png"
  "course-assets/scenes/module-12/_anchors/priya.png"
  "course-assets/scenes/module-18-lesson18A/_anchors/operator-priya.png"
)

for ref in "${REFS[@]}" "${PRIYA_REFS[@]}"; do
  if [ ! -f "$ref" ]; then
    echo "MISSING REF: $ref" >&2
    exit 1
  fi
done

STYLE='STYLE: flat sticker-sheet doodle illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only in the locked palette: cornflower-blue #62b3f3 background, yellow, orange, cream, white, and black. No gradients, no texture, no shadows, no lighting, no perspective, no skin-tone shading. Faces use flat white/cream fill, tiny dot eyes, small subtle curved cast-board nose, simple mouth. Cylindrical limbs, strong simple silhouettes, confidently imperfect hand-drawn. No ambient doodles: no hearts, sparkles, notes, thought bubbles, motion marks, icons, random props, or decorative clutter. No text, letters, words, numbers, symbols, dollar signs, labels, captions, screens with writing, or readable paperwork anywhere. Leave clean open cornflower-blue space for code-rendered Sticker overlays. 16:9 composition, 1600x900 PNG.'

gen() {
  local file="$1"
  local desc="$2"
  local style="$3"
  local log="$LOG/$file.log"
  echo "=== GEN $file ==="
  {
    echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references and cast-board character style exactly. COMPOSITION: $desc $style"
  } | codex exec \
    -i "$D/style-ref-1.png" \
    -i "$D/style-ref-2.png" \
    -i "$D/cast-board.png" \
    -i "$D/object-board.png" \
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

gen_priya() {
  local file="$1"
  local desc="$2"
  local style="$3"
  local log="$LOG/$file.log"
  echo "=== GEN PRIYA $file ==="
  {
    echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached BMH course doodle references exactly. PRIYA IDENTITY LOCK: the attached left-reference screenshot and crop are the positive source of truth. Keep Priya identical to that accepted character: black back ponytail, orange/yellow headband, orange headset with boom mic, yellow top, cream pants, orange shoes if visible, pure flat white face and hands, tiny black dot eyes, tiny curved cast-board nose, simple friendly smile, thick wobbly black outlines, rounded simple limbs. Do not turn her into a generic computer-desk worker. Do not change her face, nose, mouth, hairstyle, headset, proportions, or outfit. No large gray monitor, no laptop-dominant workstation, no black corporate desk scene, no portrait bubble, no second person, no extra face. COMPOSITION: $desc $style"
  } | codex exec \
    -i "$D/style-ref-1.png" \
    -i "$D/style-ref-2.png" \
    -i "$D/cast-board.png" \
    -i "$D/object-board.png" \
    -i "$OUT/_anchors/priya-approved-left-reference-full.png" \
    -i "$OUT/_anchors/priya-approved-left-reference-crop.png" \
    -i "course-assets/scenes/module-12/_anchors/priya.png" \
    -i "course-assets/scenes/module-18-lesson18A/_anchors/operator-priya.png" \
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
    b04) gen "m17_L17_b04_your-deal.png" "Two friendly BMH reps from the cast board standing and facing each other: the left rep hands a neat cream folder across to the right rep, and the folder has one small simple orange house icon on its front. The right rep receives it with open hands, both calm and professional with simple smiles. Exactly two people, full simple doodle bodies, no desk needed. The folder is closed and clean — no visible pages, no writing, no letters, no numbers. Leave clean bottom-center blue space for code-rendered Sticker text." "$STYLE" ;;
    b05)
      file="m17_L17_b05_strong-months.png"
      log="$LOG/$file.log"
      echo "=== GEN $file (b03 money ref) ==="
      {
        echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. MONEY MATCH: the last attached reference image shows an envelope with green cash bills — the cash in THIS image must copy that money rendering EXACTLY: same money-green flat fill, same rounded-corner bill shape, same simple bill proportions, same thick black outlines. COMPOSITION: One single cream paycheck envelope, open at the top, with three money-green cash bills sticking up out of it fanned slightly, drawn EXACTLY like the bills in the money reference. A simple bold yellow upward arrow beside the envelope to its right. Exactly two object groups. Green ONLY on the cash bills. No tiers, no stacks of coins, no staircase, no bars, no dollar signs, no numbers, no letters, no people. Leave clean bottom-center blue space for code-rendered Sticker text. $STYLE"
      } | codex exec \
        -i "$D/style-ref-1.png" \
        -i "$D/style-ref-2.png" \
        -i "$D/object-board.png" \
        -i "$OUT/m17_L17_b03_ramp-calendar.png" \
        --skip-git-repo-check \
        --sandbox workspace-write \
        > "$log" 2>&1
      if [ -f "$OUT/$file" ]; then echo "OK $file"; else echo "MISSING $file (see $log)" >&2; return 1; fi
      ;;
    b06) gen "m17_L17_b06_real-outcomes.png" "A two-panel split scene divided by one simple vertical black line. LEFT panel: a small wall calendar page with blank empty square cells and one cell outlined in orange — a scheduled slot, nothing else. RIGHT panel: a friendly seller character from the cast board actually present and talking on a simple phone call, with one blank white speech bubble above, and a single large bold black checkmark in a yellow rounded square in the panel's upper corner. The contrast reads: scheduled on the left, actually showed up on the right. No letters, no numbers, no clock faces with numerals, no money. Leave clean bottom-center blue space for code-rendered Sticker text." "$STYLE" ;;
    b09) gen_priya "m17_L17_b09_finish-line.png" "Priya joyfully breaking the tape at a race finish line, mid-stride, chest through a cream ribbon tape that is snapping into two pieces, arms raised in calm celebration. The finish line is two simple yellow posts holding the breaking tape. She still wears her orange headset — she is the same BMH rep, just crossing a finish line. Exactly one person: no other runners, no crowd, no podium, no medals, no trophies, no confetti, no rankings, no numbers on a bib — her top stays plain yellow. Simple flat ground line only. Leave clean bottom-center blue space for code-rendered Sticker text." "$STYLE" ;;
    b10) gen "m17_L17_b10_wallet.png" "A two-panel split scene divided by one simple vertical black line. LEFT panel: a single wilted, drooping cream lead-card slipping downward, sad and neglected, slightly faded. RIGHT panel: an upright cream card with a single large bold black checkmark in a yellow rounded square, and below it an open cream wallet with three flat money-green cash bills sticking up out of it. PALETTE EXCEPTION: the cash bills are flat money-green fill (plain green rectangles with thick black outlines, no gradient) — green is allowed ONLY on the cash bills; everything else stays in the locked palette. No dollar signs, no numbers, no letters, no people. Leave clean bottom-center blue space for code-rendered Sticker text." "$STYLE" ;;
    *) echo "unknown beat $1 (v5.1 fresh-gen beats: b04 b05 b06 b09 b10)" >&2; return 1 ;;
  esac
}

if [ "${1:-}" = "all" ]; then
  for b in b04 b05 b06 b09 b10; do
    run_beat "$b" || exit 1
  done
else
  run_beat "${1:?usage: gen_stills_17.sh <bNN|all>}"
fi
