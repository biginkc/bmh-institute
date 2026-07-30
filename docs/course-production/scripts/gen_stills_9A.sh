#!/bin/zsh
# Lesson 9A stills — one lane per image: zsh gen_stills_9A.sh <key>
set -u
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
D="docs/design"
AV="course-assets/avatar-candidates/andrea_headset_v2.png"
OUT="course-assets/scenes/module-09"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No ambient doodles: no hearts, sparkles, notes, thought bubbles, or motion marks. No text or words anywhere. 16:9 composition, 1600x900.'

gen() {
  local file="$1"; local desc="$2"; shift 2
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: $desc $STYLE" | \
  codex exec "$@" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

REFS=(-i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png")

case "$1" in
bench)
  gen "m09_L9A_bench_andrea.png" "ANDREA sitting relaxed on a simple doodle park bench, centered, full body clearly visible, facing the viewer directly, warm simple smile, hands resting calmly in her lap. She wears her yellow long-sleeve top and orange pants, NO phone headset (she is relaxing outdoors). IDENTICAL face to the attached Andrea reference: small dot eyes, tiny nose, simple smile, same black curly hair. Behind the bench one simple rounded tree and a low bush; a few grass tufts at ground level. Nothing else in frame. EXACTLY ONE PERSON. Her face and upper body must be large and clear (this image becomes a talking avatar)." "${REFS[@]}" -i "$AV" ;;
grace)
  gen "m09_L9A_b02_grace_call.png" "GRACE from the cast board, IDENTICAL identity: elderly woman, grey hair in a bun, round glasses, orange cardigan over a cream dress, sitting in her yellow armchair, holding a simple phone to her ear with a thoughtful pondering expression (slight head tilt). Composition weighted LEFT of center; keep the bottom-right corner area (roughly 420 pixels square) completely empty blue background. EXACTLY ONE PERSON." "${REFS[@]}" ;;
jim)
  gen "m09_L9A_b04_jim_shrug.png" "JIM from the cast board, IDENTICAL identity: older man, balding with grey hair at the sides, orange goggles resting on top of his head, yellow polo shirt, cream pants, orange shoes. He stands centered doing a big friendly puzzled shrug: shoulders raised, one palm turned up and out, the other hand holding his phone. Curious, not upset. Centered, big in frame, nothing else. EXACTLY ONE PERSON." "${REFS[@]}" ;;
david)
  gen "m09_L9A_b05_david_papers.png" "DAVID from the cast board, IDENTICAL identity: heavyset older man with a full grey beard, orange shirt, yellow-orange pants. He sits at a simple doodle kitchen table, looking down studying a few white paper sheets spread on the table plus one simple calculator. Concentrating, calm. Table and man centered, nothing else in frame. EXACTLY ONE PERSON." "${REFS[@]}" ;;
carol)
  gen "m09_L9A_b06_carol_door.png" "CAROL from the cast board, IDENTICAL identity: woman with a grey bob haircut, yellow long-sleeve top, orange pants. She stands in front of her simple cream front door (door frame visible behind her), arms crossed, holding her phone in one hand tucked against her crossed arm, wary skeptical expression (flat mouth, slightly raised brow dots). Composition weighted LEFT of center; keep the bottom-right corner area (roughly 420 pixels square) completely empty blue background. EXACTLY ONE PERSON." "${REFS[@]}" ;;
scale)
  gen "m09_L9A_b07_scale.png" "A large doodle balance scale, centered, filling most of the frame: a tall center post on a base with a horizontal beam and two hanging pans. The LEFT pan hangs LOWER (heavier) and holds a small worn house with a patched roof and one cracked window. The RIGHT pan hangs higher and holds a plain tied money bag and a simple round stopwatch. No people. Nothing else in frame." "${REFS[@]}" ;;
beth)
  gen "m09_L9A_b08_beth_boxes.png" "BETH from the cast board, IDENTICAL identity: woman with dark curly hair and an orange hair clip, yellow top, cream pants, orange shoes. She walks carrying one kraft-brown cardboard moving box with both arms; beside her a neat stack of two more kraft-brown cardboard boxes (cardboard stays realistic kraft brown — approved object-realism exception). Ready-to-move energy, small smile. Centered, nothing else in frame. EXACTLY ONE PERSON." "${REFS[@]}" ;;
*) echo "unknown key $1"; exit 1 ;;
esac
