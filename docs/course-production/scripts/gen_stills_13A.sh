#!/bin/zsh
# Lesson 13A stills — run one lane per image or `all`.
set -u
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"

D="docs/design"
OUT="course-assets/scenes/module-13"
LOG="course-assets/scenes/module-13/_logs"
mkdir -p "$OUT" "$LOG"

REFS=(
  "$D/style-ref-1.png"
  "$D/style-ref-2.png"
  "$D/cast-board.png"
  "$D/object-board.png"
)

for ref in "${REFS[@]}"; do
  if [ ! -f "$ref" ]; then
    echo "MISSING REF: $ref" >&2
    exit 1
  fi
done

STYLE='STYLE: flat sticker-sheet doodle illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only in the locked palette: cornflower-blue #62b3f3 background, yellow, orange, cream, white, and black. No gradients, no texture, no shadows, no lighting, no perspective, no skin-tone shading. Faces must match the cast-board: flat white/cream fill, tiny black dot eyes only, tiny centered two-stroke/comma nose, and a very small simple mouth. Do not use ring eyes, side-eye eyeballs, large open mouths, teeth, eyebrows, sunglasses, or detailed expressions. Show emotion mainly through body posture, not altered facial anatomy. Cylindrical limbs, strong simple silhouettes, confidently imperfect hand-drawn. No ambient doodles: no hearts, sparkles, notes, thought bubbles, motion marks, icons, random props, or decorative clutter. No text, letters, words, numbers, symbols, dollar signs, labels, captions, screens with writing, or readable paperwork anywhere unless the composition explicitly requests the exact plaque phrase EMPLOYEE OF THE MONTH. Leave clean open cornflower-blue space for code-rendered Sticker overlays. 16:9 composition, 1600x900 PNG.'

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
  b04)
    gen "m13_L13A_b04_your-deal.png" "Winner podium scene on a plain cornflower-blue field, like after a race. CENTER: one BMH follow-up representative woman inspired by PRIYA on the cast-board: black hair pulled into a back ponytail, orange/yellow headband, simple orange phone headset, yellow top, cream pants. She stands proudly on the tallest center winner platform and wears several round gold/yellow medals around her neck on simple orange ribbons. LEFT and RIGHT: two shorter podium platforms beside her, one medium height and one low height. Put one cast-board-inspired competitor character standing on each shorter platform, both visibly disappointed by posture only: slumped shoulders, arms crossed or hands down, tiny dot eyes, tiny downturned mouth. They must not wear headsets and must not look like clones of the winner. NO numerals, no 1/2/3, no trophy text, no race banners, no names. Exactly three people total. Keep upper left and lower center open for later code labels." ;;
  b11)
    gen "m13_L13A_b11_top-earners.png" "Top performer awards wall scene on a plain cornflower-blue field. One BMH follow-up representative woman inspired by PRIYA on the cast-board: black hair pulled into a back ponytail, orange/yellow headband, simple orange phone headset, yellow top, cream pants. She stands proudly in the foreground, full body, shoulders back, small cast-board smile, one hand on hip or relaxed. Behind her is a wall of actual award plaques, not random squares: shield-shaped plaques, beveled plaque boards, ribbon-top awards, and framed certificate plaques, arranged in neat rows. Each plaque should clearly read EMPLOYEE OF THE MONTH in short uppercase hand-lettering. Repeat only that exact phrase; no names, no dates, no numerals, no extra words. Plaques are cream/yellow/orange with black outlines. Exactly one person total, no clones. Leave clean open space near the bottom for later code labels." ;;
  b12)
    gen "m13_L13A_b12_money-table.png" "Comedic chase scene on a plain cornflower-blue field, but keep faces on-brand with the cast-board. LEFT/BACK: one BMH follow-up representative woman inspired by PRIYA on the cast-board, wearing the simple orange phone headset, yellow top, cream pants, and ponytail/headband. She runs forward with a determined posture and arms reaching forward but not touching anyone; her face uses tiny dot eyes and a small simple mouth only, not crazy eyes. RIGHT/FRONT: one seller/homeowner inspired by the curly black-haired man in the orange shirt and cream pants from the cast-board runs away, body leaning away and shoulders tense. His face must use tiny black dot eyes, tiny centered two-stroke/comma nose, and a small worried downturned mouth only; no large ring eyes, no big open mouth, no teeth, no horror face. The scene should read cartoon-safe and funny, not violent, not horror, no weapons, no contact, no injury. Exactly two people total, clearly different characters, no clones. Leave clean open blue space above and lower center for later code labels." ;;
  all)
    "$0" b04 &
    pids=($!)
    "$0" b11 &
    pids+=($!)
    "$0" b12 &
    pids+=($!)
    fail=0
    for pid in "${pids[@]}"; do
      wait "$pid" || fail=1
    done
    exit "$fail"
    ;;
  *)
    echo "usage: $0 {b04|b11|b12|all} (b10 is an Andrea avatar/code beat, not a still)" >&2
    exit 2
    ;;
esac
