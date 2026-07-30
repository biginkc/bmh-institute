#!/bin/zsh
# Lesson 5A "Opening the Call" stills — one lane per image: zsh gen_stills_5A.sh <key>
# Fire each key as its own background bash call (all lanes in one turn).
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "${0:A:h}/../../.." && pwd)}"
D="docs/design"
OUT="course-assets/scenes/module-05"
REP="course-assets/avatar-candidates/andrea_headset_v2.png"   # headset-Andrea identity ref
mkdir -p "$OUT"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. 16:9 composition, 1600x900.'

# generic gen (style refs only)
gen() {
  local file="$1"; local desc="$2"; local style="${3:-$STYLE}"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: $desc $style" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}
# rep gen (adds the headset-Andrea identity ref for the in-scene rep beats)
genrep() {
  local file="$1"; local desc="$2"
  echo "=== GENREP $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. The woman wearing the phone headset (our BMH representative) must have the IDENTICAL face to the attached headset reference image: tiny dot eyes, small simple nose, simple friendly smile, same headset. COMPOSITION: $desc $STYLE" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" -i "$REP" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
# b03 — headset-Andrea rep at a small desk, mid phone-call, demonstrating the opening (Seedance source; voice-only beat, so centered)
democall)
  genrep "m05_L5A_demo-call.png" "The BMH representative woman wearing a phone headset sits at a small simple desk, CENTERED in the frame, mid phone-call and clearly talking — one hand raised in a natural friendly talking gesture near her shoulder, warm confident smile, upright posture. On the desk: a small notepad and a coffee mug. Symmetric composition with generous equal open cornflower-blue space on the left and right and above (room for callouts). EXACTLY ONE PERSON, no clone, no second person. Nothing else in frame." ;;

# b07 — a hand holding a pen, writing on a notepad (Seedance source: the writing motion). No people/faces, just the hand + pen + pad.
pennote)
  gen "m05_L5A_pen-notepad.png" "A single friendly cartoon hand and forearm entering from the lower right, holding a chunky pen, poised writing on an open rectangular notepad that sits centered and large in the frame. The notepad has a few BLANK horizontal rounded lines (empty — the words are added later in code), a spiral binding at the top, cream page with a thick black outline. Nothing else in frame. Absolutely NO letters, numbers, or words anywhere on the pad or elsewhere." ;;

# b08 — ONE seller on a couch, getting up to grab a pen (Seedance source: the rise/reach). Living room, TV.
sellercouch)
  gen "m05_L5A_seller-couch.png" "ONE homeowner sitting on a simple two-seat couch on the RIGHT, leaning forward and starting to rise, reaching one hand toward a pen and small notepad lying on a low coffee table in front of them. To the LEFT sits a simple boxy TV on a stand showing a blank cream screen. A simple potted plant beside the couch. Plain white face, no skin tone, calm engaged expression, palette only (black, cream, yellow, orange, white). Living-room floor line. EXACTLY ONE PERSON, no clone, no second person. Open cornflower-blue above. Nothing else in frame." ;;

# b10 (optional) — headset-Andrea rep offering a business card forward (Seedance source: gentle offer/idle)
cardhand)
  genrep "m05_L5A_card-handoff.png" "The BMH representative woman wearing a phone headset stands on the LEFT third of the frame, turned slightly to the right, holding out a small rectangular business card in one hand and offering it forward toward the open right side of the frame, warm sincere smile, other hand relaxed at her side. The card is a plain cream rounded rectangle with NO text on it (details added later in code). The RIGHT two thirds of the frame is open cornflower-blue. EXACTLY ONE PERSON, no clone, no second person. Nothing else in frame." ;;

# b02 — doodle stopwatch prop (code pulses it; "15 SECONDS" is a code sticker)
stopwatch)
  gen "m05_L5A_stopwatch.png" "A single big round doodle stopwatch centered in the frame: a cream circular face with a thick black rim, a round push-button and small ring loop at the top, twelve short black tick marks evenly around the edge, and two black hands (one short, one long sweep hand) meeting at a center dot. Clean, friendly, readable. Generous open cornflower-blue all around. NO numerals, NO letters, NO words anywhere. Nothing else in frame." ;;

# b05 — two doodle doors side by side (approval vs denial; labels are code stickers)
twodoors)
  gen "m05_L5A_two-doors.png" "Two simple free-standing doodle doors side by side on a common ground line, centered with a gap between them. The LEFT door is bright and welcoming, slightly ajar and open toward the viewer with a cheerful yellow glow spilling out, a round doorknob. The RIGHT door is closed and plain cream with a small blank rectangular sign plaque mounted on it (empty — text added later in code) and a round doorknob. Equal size, evenly balanced, generous open cornflower-blue around and above. NO letters, numbers, or words anywhere. Nothing else in frame." ;;

# b11 — a cell phone and a landline phone side by side (follow-up split; labels are code stickers)
phones)
  gen "m05_L5A_phones.png" "Two simple doodle phone props side by side on a common ground line, centered with a clear gap. On the LEFT: a modern rectangular smartphone standing upright, blank cream screen, a small round camera dot, thick black outline. On the RIGHT: a classic corded landline desk phone — a boxy base with round buttons and a curved handset resting on top, a coiled cord. Equal visual weight, evenly balanced, generous open cornflower-blue around and above. NO letters, numbers, or words anywhere. Nothing else in frame." ;;

*) echo "unknown key $1"; exit 1 ;;
esac
