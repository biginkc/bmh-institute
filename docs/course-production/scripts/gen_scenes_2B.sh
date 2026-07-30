#!/bin/zsh
# Lesson 2B v2 — situational scene stills (ONE per seller), identity-matched to the approved portrait.
# usage: zsh gen_scenes_2B.sh <david|beth|ray|carol|marcus>
# Full doodle SCENE (not head-shoulders): the seller is IN the scene, weary/frustrated, depicting their problem.
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "${0:A:h}/../../.." && pwd)}"
D="docs/design"
OUT="course-assets/scenes/module-02-lesson2B"
mkdir -p "$OUT"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black, light gray) on a single flat cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective grid. Icon-level faces: tiny dot eyes, one small nose line, one simple mouth line, minimal features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading (faces are pale near-white cream). No ambient doodles (no hearts, sparkles, music notes, speech bubbles, motion/emphasis marks). 16:9 wide composition, 1600x900, the whole scene fully in frame with even cornflower-blue margin — nothing clipped at the edges.'

gen() {
  local key="$1"; local portrait="$2"; local face="$3"; local scene="$4"; local capsnote="${5:-No text or words anywhere.}"
  local file="m02_L2B_${key}_scene.png"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly, and the person is the SAME character as the attached portrait $portrait — IDENTICAL face and build: $face SCENE: $scene The person is a full or half-length figure standing/seated within the scene (NOT a head-and-shoulders portrait). Weary, worn, honest emotional tone — no smiling. $STYLE $capsnote EXACTLY ONE PERSON in the whole image, no second person, no clone, no reflection of the person." | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" -i "$OUT/$portrait" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -4
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
david)
  gen david "m02_L2B_david.png" \
    "ONE doodle man in his sixties, heavyset with a round face, BALD on top with grey hair at the sides and a FULL GREY BEARD, wearing an orange shirt. Pale near-white cream face, weary heavy-eyed downturned expression." \
    "David stands on a plain simple front walk outside his small single-story rental house. Keep the HOUSE VERY SIMPLE, MINIMAL and FLAT to match the brand: one clean flat house body (cream), a simple low roof, exactly ONE door and ONE window, drawn as plain flat doodle shapes. ABSOLUTELY NO fine detailing: NO individual shingles, NO wood-plank lines on the walls, NO cracks in the walk, NO stones or scattered bushes, no busy texture of any kind — just clean bold outlines and flat fills like the style sheet. A single small PAST DUE notice on the door. He holds a plain phone at his side (NO vibration ticks, no motion marks). Slumped weary posture, shoulders down." \
    "One short caps phrase PAST DUE is allowed on the door notice; keep letters clean and legible; no other text anywhere." ;;
beth)
  gen beth "m02_L2B_beth.png" \
    "ONE doodle woman in her early forties, medium build, shoulder-length BLACK hair (not grey, not elderly), no glasses, white shirt. Pale near-white cream face, quiet grieving tired expression. She is the ONLY real person in the scene." \
    "Beth stands INSIDE her mother's quiet LIVING ROOM. Simple flat brand-style room: a plain sofa, a small side table, a rug, a window — clean flat doodle shapes, minimal. Prominently on the WALL BEHIND her hangs a large FRAMED PORTRAIT PHOTO of an ELDERLY woman — her late mother — shown as a framed head-and-shoulders picture of an old woman with short grey/white hair and a gentle face, clearly a memorial photo of someone who has passed. Beth stands quietly, one hand resting on the sofa or at her side, subdued and grieving as she looks around the room. Keep everything flat: flat fills, thick clean outlines, no gradients, no shadows, no busy texture." \
    "No text or words anywhere. The framed photo on the wall is a DRAWN PORTRAIT of a face, not text." ;;
ray)
  gen ray "m02_L2B_ray.png" \
    "ONE doodle man in his forties, average build, SHORT RECEDING DARK hair, clean-shaven, pale-yellow/cream shirt. Pale near-white cream face, overwhelmed hollow anxious expression." \
    "Ray sits at his kitchen table, both hands to his head, STARING DOWN at a lender's LETTER on the table that has a small RED STAMP on it. A round WALL CLOCK hangs on the wall behind him. An empty jacket is draped over the back of the EMPTY CHAIR across the table (he lost his job). Overwhelmed, sunk posture." \
    "No text or words anywhere (the red stamp is a plain red mark, not letters)." ;;
carol)
  gen carol "m02_L2B_carol.png" \
    "ONE doodle woman in her sixties, short curly LIGHT-GREY hair, ROUND GLASSES, cream shirt. Pale near-white cream face, frustrated fed-up expression, lips pressed together." \
    "Carol stands just outside her own front door holding up a single sheet of paper marked LIEN. Beside her is a HALF-FINISHED repair the contractor abandoned: a leaning step LADDER and an open PAINT CAN with a brush across it, a patch of unfinished wall. No worker present. Arms tense, frustrated." \
    "One short caps word LIEN is allowed on the paper she holds; keep letters clean and legible; no other text anywhere." ;;
marcus)
  gen marcus "m02_L2B_marcus.png" \
    "ONE doodle man in his thirties, lean slim face, fuller DARK hair, clean-shaven, yellow shirt. Pale near-white cream face, tense stuck worried expression." \
    "Marcus stands in the DRIVEWAY in the foreground, hands in his pockets, tense and stuck. Behind him rises a large, beautiful, ELABORATE MULTI-STORY DREAM HOUSE — several stories tall, a grand ornate facade with many windows, a peaked and gabled roofline, a chimney, maybe a small columned entry — clearly an expensive, impressive dream home. Marcus reads a little small in the foreground against the big house behind. Keep everything FLAT brand doodle style: flat fills (cream house, orange/yellow roof accents), thick clean outlines, NO gradients, NO shadows, NO fine texture. A simple flat driveway strip leads to the house." \
    "No text or words anywhere." ;;
*) echo "unknown key $1"; exit 1 ;;
esac
