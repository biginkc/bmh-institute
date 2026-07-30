#!/bin/zsh
# Lesson 9A stills v3 — CANONICAL NOSE fix (Jarrad 2026-07-06): small curved hook/comma nose like the cast board.
# NOT noseless (v2 was wrong), NOT the wrong pointed/bracket nose (v1 was wrong). Match previous modules exactly.
# Beth stays re-designed distinct from Andrea. Scale (b07) unchanged (no person).
# one lane per image: zsh gen_stills_9A_v3.sh <key>
set -u
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
D="docs/design"
AV="course-assets/avatar-candidates/andrea_headset_v2.png"
OUT="course-assets/scenes/module-09"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Faces exactly match the attached cast board: small dot eyes, a SMALL SUBTLE CURVED NOSE (a tiny hook/comma line, same size and shape as the cast-board characters — NOT large, NOT pointed, NOT a bracket, NOT a beak; just a little curved line), and a simple small mouth. Cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No ambient doodles: no hearts, sparkles, notes, thought bubbles, or motion marks. No text or words anywhere. 16:9 composition, 1600x900.'

gen() {
  local file="$1"; local desc="$2"; shift 2
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references and cast board EXACTLY, including the small curved nose style. COMPOSITION: $desc $STYLE" | \
  codex exec "$@" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

REFS=(-i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png")

case "$1" in
bench)
  gen "m09_L9A_bench_andrea.png" "ANDREA sitting relaxed on a simple doodle park bench, centered, full body clearly visible, facing the viewer directly, warm simple smile, hands resting calmly in her lap. She wears her yellow long-sleeve top and orange pants, NO phone headset (she is relaxing outdoors). IDENTICAL face to the attached Andrea reference and cast board: small dot eyes, the SAME small curved nose as the cast board, simple smile, same black curly hair. Behind the bench one simple rounded tree and a low bush; a few grass tufts at ground level. Nothing else in frame. EXACTLY ONE PERSON, no clone. Her face and upper body must be large and clear (this image becomes a talking avatar)." "${REFS[@]}" -i "$AV" ;;
grace)
  gen "m09_L9A_b02_grace_call.png" "GRACE from the cast board, IDENTICAL identity: elderly woman, grey hair in a bun, round glasses, orange cardigan over a cream dress, sitting in her yellow armchair, holding a simple phone to her ear with a thoughtful pondering expression (slight head tilt). Same small curved cast-board nose. Composition weighted LEFT of center; keep the bottom-right corner area (roughly 420 pixels square) completely empty blue background. EXACTLY ONE PERSON, no clone." "${REFS[@]}" ;;
jim)
  gen "m09_L9A_b04_jim_shrug.png" "JIM from the cast board, IDENTICAL identity: older man, balding with grey hair at the sides, orange goggles resting on top of his head, yellow polo shirt, cream pants, orange shoes. He stands centered doing a big friendly puzzled shrug: shoulders raised, one palm turned up and out, the other hand holding his phone. Curious, not upset. Same small curved cast-board nose. Centered, big in frame, nothing else. EXACTLY ONE PERSON, no clone." "${REFS[@]}" ;;
david)
  gen "m09_L9A_b05_david_papers.png" "DAVID from the cast board, IDENTICAL identity: heavyset older man with a full grey beard, orange shirt, yellow-orange pants. He sits at a simple doodle kitchen table, looking down studying a few white paper sheets spread on the table plus one simple calculator. Concentrating, calm. Same small curved cast-board nose above the beard. Table and man centered, nothing else in frame. EXACTLY ONE PERSON, no clone." "${REFS[@]}" ;;
carol)
  gen "m09_L9A_b06_carol_door.png" "CAROL from the cast board, IDENTICAL identity: woman with a grey bob haircut, yellow long-sleeve top, orange pants. She stands in front of her simple cream front door (door frame visible behind her), arms crossed, holding her phone in one hand tucked against her crossed arm, mildly wary skeptical expression (flat mouth). Same small curved cast-board nose; NO eyebrows (match the cast board — convey wary through the flat mouth only). Composition weighted LEFT of center; keep the bottom-right corner area (roughly 420 pixels square) completely empty blue background. EXACTLY ONE PERSON, no clone." "${REFS[@]}" ;;
beth)
  gen "m09_L9A_b08_beth_boxes.png" "A cheerful young woman mover, clearly a DIFFERENT person from the curly-black-haired yellow-top narrator Andrea. Her look: LIGHT BROWN hair pulled back into a neat ponytail with a small orange hair clip (NOT black, NOT loose curls), wearing an ORANGE t-shirt and cream pants with orange shoes. She walks carrying one kraft-brown cardboard moving box with both arms; beside her a neat stack of two more kraft-brown cardboard boxes (cardboard stays realistic kraft brown — approved object-realism exception). Ready-to-move energy, small smile. Same small curved cast-board nose. Centered, nothing else in frame. EXACTLY ONE PERSON, no clone. She must NOT resemble Andrea." "${REFS[@]}" ;;
*) echo "unknown key $1"; exit 1 ;;
esac
