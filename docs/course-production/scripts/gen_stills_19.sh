#!/bin/zsh
# Lesson 19 v6 still corrections. Run one lane per image or `all`.
set -eu
SCRIPT_PATH="${0:A}"
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"

D="docs/design"
OUT="course-assets/scenes/module-19"
LOG="$OUT/_logs"
PRIYA_REF="$OUT/_anchors/priya-canonical-v6.png"
mkdir -p "$OUT" "$LOG"

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

STYLE='STYLE: flat BMH sticker-sheet doodle illustration, thick black hand-drawn outlines with a slight wobble, rounded simple forms, and flat fills only. Locked palette: cornflower-blue #62b3f3 background, yellow #FFD23F, orange, cream #FFF7DE, pure white #FFFFFF, and black #111111. No gradients, texture, shading, shadows, lighting effects, perspective, or skin-tone shading. Every visible face and hand is pure flat white #FFFFFF. Cream is allowed for paper, folders, clothing, furniture, and screens, never skin. Tiny dot eyes, tiny curved cast-board nose, simple mouth. No ambient doodles, hearts, sparkles, notes, thought bubbles, speech bubbles, motion marks, random props, or decorative clutter. 16:9 composition, 1600x900 PNG.'

PRIYA='PRIYA IDENTITY AND BODY LOCK: Priya must match the attached canonical Priya reference, which overrides all other character references. She has a large rounded head relative to her body, a very short visible neck, broad compact shoulders and torso, loose cropped cream pants, short wide legs, black back ponytail, orange/yellow headband, orange headset with boom mic, yellow top, orange shoes, and pure flat white face and hands. Reject a skinny silhouette, long neck, long torso, long legs, narrow shoulders, small head, cream skin, or face drift.'

NEG='NEGATIVE: no Andrea narrator, no duplicate Priya, no extra people beyond the requested count, no tan, peach, pink, brown, cream, yellow, or orange skin, no gradients, no shadows, no decorative filler, no clutter, no watermark, no logo, no clipped subject, and no readable text except the exact approved words named in the prompt.'

gen_scene() {
  local file="$1"
  local source="$2"
  local desc="$3"
  local text_rules="$4"
  local log="$LOG/$file.log"
  local dest="$OUT/$file"
  local candidate="$OUT/.candidates/${file:r}-$$-${EPOCHSECONDS}.png"

  if [ ! -f "$source" ]; then
    echo "MISSING SOURCE REF: $source" >&2
    return 1
  fi
  if [ -e "$dest" ]; then
    echo "REFUSING TO OVERWRITE VERSIONED STILL: $dest" >&2
    return 1
  fi
  mkdir -p "$OUT/.candidates"

  echo "=== GEN $file ==="
  {
    echo "Generate one identity-preserving scene revision with gpt-image-2 and save it to $candidate as a 1600x900 PNG. INPUT ROLES: the final attached image is the edit-target composition to preserve; $PRIYA_REF is the highest-priority Priya identity and body reference; the style, cast, and object boards constrain the BMH art style. Preserve all approved scene geometry and meaning except the explicitly requested edits. $PRIYA COMPOSITION: $desc TEXT: $text_rules $STYLE $NEG"
  } | if ! codex exec \
    -i "$D/style-ref-1.png" \
    -i "$D/style-ref-2.png" \
    -i "$D/cast-board.png" \
    -i "$D/object-board.png" \
    -i "$PRIYA_REF" \
    -i "$source" \
    --skip-git-repo-check \
    --sandbox workspace-write \
    > "$log" 2>&1; then
      if rg -qi 'insufficient.*credit|credit balance|out of credits' "$log"; then
        echo "INSUFFICIENT CREDIT (see $log)" >&2
      else
        echo "GENERATOR FAILED (see $log)" >&2
      fi
      return 1
    fi

  if [ -f "$candidate" ]; then
    mv "$candidate" "$dest"
    echo "OK $file"
  else
    echo "MISSING $file (see $log)" >&2
    return 1
  fi
}

run_beat() {
  case "$1" in
    b02)
      gen_scene \
        "m19_L19_b02_foundation-conveyor-v6.png" \
        "$OUT/m19_L19_b02_foundation-conveyor.png" \
        "Left-to-right conveyor qualification scene. A visibly messy raw lead packet enters on the left. Priya operates the central qualification machine. A neat qualified lead packet exits on the right. Preserve the machine, conveyor, and obvious before-to-after transformation. Remove decorative alarm rays and loose punctuation marks. EXACTLY ONE PERSON." \
        "Render exactly three correctly spelled integrated labels: RAW LEAD on the left input packet, QUALIFICATION on the machine, and QUALIFIED LEAD on the right output packet. No other words, letters, or numbers." ;;
    b03)
      gen_scene \
        "m19_L19_b03_clean-file-hug-v6b.png" \
        "$OUT/m19_L19_b03_clean-file-hug.png" \
        "Priya lovingly hugs one tidy cream folder against her chest. Preserve the warm, work-focused pose and clean blue space. Remove the empty tray or box from the floor completely. Nothing sits on the floor. Make Priya visibly compact like the canonical crop: her head and hair occupy roughly the top third of her full height, her neck is almost absent, her torso is short and broad, and her cropped pant legs are short and wide. EXACTLY ONE PERSON." \
        "Render exactly two correctly spelled integrated labels on the folder or its tabs: CLEAN FILE and READY FOR ACQUISITION. Spell the second label A-C-Q-U-I-S-I-T-I-O-N, producing the exact complete word ACQUISITION. No other words, letters, or numbers." ;;
    b05)
      gen_scene \
        "m19_L19_b05_complex-lead-maze-v6.png" \
        "$OUT/m19_L19_b05_complex-lead-maze.png" \
        "Priya navigates the large maze toward the visible right-side exit while holding one blank map. Preserve the existing maze geometry and Priya's compact walking pose. Replace the three empty cream signboards with three meaningful integrated labeled markers placed at separate maze turns. No blank signboard or empty plaque remains anywhere. EXACTLY ONE PERSON." \
        "Render exactly three correctly spelled integrated labels inside the maze: PROBATE, MULTI-OWNER, and DISTRESS. No other words, letters, or numbers." ;;
    b06)
      gen_scene \
        "m19_L19_b06_deal-conference-v6.png" \
        "$OUT/m19_L19_b06_deal-conference-v3.png" \
        "Conference-stage scene. Canonical compact Priya presents to the same packed simple audience. Preserve the stage, podium, audience arrangement, and large presentation screen. The screen shows blank offer packet, terms sliders, negotiation table, and signed-contract icons connected by arrows. Every visible audience face and hand is pure flat white. Priya is not tall, skinny, stretched, or long-legged." \
        "ZERO readable text, letters, numbers, captions, labels, or UI text anywhere on the stage, screen, audience, or props." ;;
    b08)
      gen_scene \
        "m19_L19_b08_priya-coaching-v6.png" \
        "$OUT/m19_L19_b08_priya-coaching.png" \
        "Practical coaching scene with EXACTLY TWO PEOPLE. Canonical compact Priya sits or stands beside one distinct headset-wearing teammate at a computer and points gently toward the screen. Correct Priya's seated head, neck, shoulders, torso, and leg proportions. The teammate remains visually distinct and is learning. Preserve the desk, monitor, keyboard, and coaching meaning. Both people have pure flat white faces and hands." \
        "ZERO readable text, letters, numbers, captions, labels, or UI text. The computer contains blank panes and rows only." ;;
    all)
      typeset -a pids
      for b in b02 b03 b05 b06 b08; do
        zsh "$SCRIPT_PATH" "$b" &
        pids+=($!)
      done
      fail=0
      for pid in "${pids[@]}"; do
        wait "$pid" || fail=1
      done
      exit "$fail"
      ;;
    *)
      echo "usage: $0 {b02|b03|b05|b06|b08|all}" >&2
      return 2
      ;;
  esac
}

run_beat "${1:-}"
