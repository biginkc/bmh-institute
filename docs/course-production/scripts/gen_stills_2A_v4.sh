#!/bin/zsh
# Lesson 2A Rev4 stills — one lane per image: zsh gen_stills_2A_v4.sh <key>
set -u
cd "${BMH_INSTITUTE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
D="docs/design"
OUT="course-assets/scenes/module-02"

STYLE='STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. 16:9 composition, 1600x900.'

gen() {
  local file="$1"; local desc="$2"; local style="${3:-$STYLE}"
  echo "=== GEN $file ==="
  echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900). Match the attached style references exactly. COMPOSITION: $desc $style" | \
  codex exec -i "$D/style-ref-1.png" -i "$D/style-ref-2.png" -i "$D/cast-board.png" --skip-git-repo-check --sandbox workspace-write 2>&1 | tail -3
  [ -f "$OUT/$file" ] && echo "OK $file" || echo "MISSING $file"
}

case "$1" in
b12)
  gen "m02_L2A_b12_motivated_stand.png" "ONE cast-board-style homeowner STANDING, engaged and open, gesturing warmly with both hands, head tilted UP looking upward toward the top of the frame with a hopeful, eager expression. Leave a large area of empty cornflower-blue space ABOVE the head (a code label goes there later). The figure sits in the lower-center of the frame. EXACTLY ONE PERSON, no clone. Nothing else in frame." ;;
b13)
  gen "m02_L2A_b13_curious_stand.png" "ONE cast-board-style homeowner STANDING with arms crossed, aloof and skeptical, one eyebrow raised, head tilted UP glancing upward toward the top of the frame with a doubtful expression. Leave a large area of empty cornflower-blue space ABOVE the head (a code label goes there later). The figure sits in the lower-center of the frame. EXACTLY ONE PERSON, no clone. Nothing else in frame." ;;
b14)
  gen "m02_L2A_b14_overshoulder.png" "ONE cast-board-style homeowner STANDING with their BACK turned to the camera — we see their back, shoulders, and the back of their head — while they twist to glance back over one shoulder toward the viewer, with a wary, guarded, slightly worried expression, as if hiding what they are really feeling. EXACTLY ONE PERSON, no clone. Centered, generous plain cornflower-blue space. Nothing else in frame." ;;
b16)
  gen "m02_L2A_b16_notes.png" "A single doodle computer monitor centered in the frame on a simple stand. The monitor's OUTER BEZEL and CASING are solid BLACK (a real computer-screen look). Inside the black bezel, the screen is cream and shows a simple CRM lead profile: at the top-left a small round person avatar icon beside a blank rounded name bar; below it two short blank rounded detail bars like form fields; and filling the lower half a clearly outlined rectangular NOTES box with three or four blank horizontal writing lines and a small pen resting on it. STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines, flat fills, no gradients, no shadows, on cornflower-blue background. The monitor bezel, casing and stand are BLACK (a deliberate exception to the palette). The ONLY text is the single capital word NOTES above the notes box; every other field is a blank rounded pseudo-text bar, no other letters or numbers. 16:9, 1600x900." ;;
b20)
  gen "m02_L2A_b20_handshake.png" "An extreme close-up of two hands clasped in a warm, firm handshake, filling most of the frame. The HANDS themselves are WHITE (flat white fill with thick black outlines), not cream. Two forearms come in from the left and the right and meet in the center: the LEFT sleeve is cream, the RIGHT sleeve is orange, so they read as two different people. Simple doodle hands with a couple of knuckle and finger lines. Centered on plain cornflower-blue. No faces, no bodies, just the two white hands and forearms shaking. Nothing else in frame." ;;
*) echo "unknown key $1"; exit 1 ;;
esac
