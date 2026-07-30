#!/usr/bin/env python3
"""Build post-model-selection animation queues for Lesson 4B.

This script does not call Higgsfield and does not choose a model. It creates
the exact clip slots, prompts, source stills, and output paths needed after
Jarrad/Claude selects an animation model.
"""
import argparse
import json
import math
from pathlib import Path

B = Path("/Users/jarradhenry/Sites/BMH apps/BMH Institute")
STATE = B / "course-assets/heygen/lesson4B/_state.json"
SCENES = B / "course-assets/scenes/module-04-lesson4B"
OUT_ROOT = B / "course-assets/review-lesson4B/animation-queue"
FULL_ROOT = B / "course-assets/heygen/lesson4B/grok/full"

MODELS = {
    "seedance_2_0": {"maxDuration": 15, "durationOptions": [4, 5, 6, 8, 10, 12, 15]},
    "kling3_0": {"maxDuration": 15, "durationOptions": [3, 4, 5, 6, 8, 10, 12, 15]},
    "wan2_7": {"maxDuration": 15, "durationOptions": [2, 3, 4, 5, 6, 8, 10, 12, 15]},
    "minimax_hailuo": {"maxDuration": 10, "durationOptions": [6, 10]},
    "veo3_1_lite": {"maxDuration": 8, "durationOptions": [4, 6, 8]},
}
MIXED_MODELS = {
    "mixed_kling_b4b_seedance_b5": {
        "description": "Jarrad-approved mixed bake-off choice: Kling for B4B, Seedance for B5; Seedance default for the remaining non-bakeoff beats pending individual clip review.",
        "default": "seedance_2_0",
        "overrides": {
            "b04b_offer": "kling3_0",
            "b05_step5_close": "seedance_2_0",
        },
    },
}

STYLE_LOCK = (
    "Flat sticker-sheet doodle illustration. Thick black hand-drawn outlines with a slight wobble. "
    "Rounded simple forms. Flat fills only: yellow, orange, cream, white, black on cornflower-blue background. "
    "No gradients, no texture, no shadows, no lighting, no perspective, no skin-tone shading. "
    "Tiny dot eyes, minimal facial features, tiny centered two-stroke/comma nose, cylindrical limbs, strong simple silhouettes. "
    "No text or words anywhere. One single continuous shot; no cuts, no scene changes."
)

NEGATIVE = (
    "NEGATIVE: photorealism, 3D render, cinematic lighting, shadows, gradients, texture, skin-tone shading, "
    "detailed eyes, detailed nose, realistic anatomy, text, captions, numbers, logos, watermarks, extra people, "
    "duplicate characters, clone characters, reference sheets, style board flashes, new props, floating speech bubbles, "
    "floating icons, cuts, scene changes, sudden zooms, prop morphing, face drift, nose drift."
)

BEATS = {
    "b02_step1_intro": {
        "still": "m04_L4B_v1_framework_locked.png",
        "context": "Step one is the Intro, where you set expectations and tell them what they will get from the conversation.",
        "motions": [
            "Five blank connected framework cards subtly breathe and settle; a grounded token shifts gently across the first card area. Keep every card blank.",
        ],
    },
    "b03_step2_factfind": {
        "still": "m04_L4B_v2_factfind_listen_nobubble.png",
        "context": "Step two is Fact Find: ask questions, qualify, listen, and talk about the person, not the house.",
        "motions": [
            "Seller on the right talks naturally with small hand movement; BMH representative on the left listens, nods once, and takes quiet notes.",
            "BMH representative continues listening and writing while seller finishes explaining the situation; no speech bubbles.",
        ],
    },
    "b04a_pitch": {
        "still": "m04_L4B_v4a_pitch_grounded.png",
        "context": "Step three is Pitch: present what BMH does; this is the property-heavy part of the conversation.",
        "motions": [
            "BMH representative gestures calmly toward the grounded property visual while seller listens. Property visual stays grounded.",
            "Seller looks at the simple property visual while the representative finishes the pitch gesture. No keys, cards, contracts, dollar signs, or text.",
        ],
    },
    "b04b_offer": {
        "still": "m04_L4B_v4b_offer_handoff_animated_base.png",
        "context": "Step four is Offer: transition toward next steps and tee up the handoff rather than throwing out a number.",
        "motions": [
            "BMH representative tees up the next step with a small open-hand gesture while seller reacts thoughtfully. No dollar number, no contract, no floating card.",
        ],
        "bakeoffReusable": True,
    },
    "b05_step5_close": {
        "still": "m04_L4B_v5_rep_closeup_headset.png",
        "context": "Step five is Close: get commitment, appointment, offer agreement, or firm follow-up time.",
        "motions": [
            "Tight close-up of the BMH representative speaking through her headset. Subtle mouth, head, and handset expression only. No extra person, no clone.",
            "Same close-up continues with a small confident nod and calm headset posture while she confirms commitment.",
        ],
        "bakeoffReusable": True,
    },
    "b06_structure_vs_execution": {
        "still": "m04_L4B_v1_framework_locked.png",
        "context": "Pipeline stages tell you where the lead is organizationally; conversation steps move each individual call forward.",
        "motions": [
            "Blank framework cards subtly organize into a clear flow. Wordless contrast between structure and call movement; keep cards blank.",
            "The grounded token moves through the blank flow while the cards stay stable; no labels or text.",
        ],
    },
    "b07_8020_rule": {
        "still": "m04_L4B_v7_person_situation_8020.png",
        "context": "About eighty percent should be about the person's situation; the situation is the problem, the house is the vehicle.",
        "motions": [
            "Seller at the table with blank papers looks concerned and gestures lightly. No background house icon, no floating house.",
            "Seller processes the situation and shifts expression from concerned to understood. Keep seller identity locked.",
            "Seller relaxes slightly while the blank papers stay grounded on the table. No phone, no text, no new props.",
        ],
    },
    "b08_slow_down": {
        "still": "m04_L4B_v8_slow_down_care_reroll.png",
        "context": "Slow down. Build the relationship. Actually care about what is going on. The deals will follow.",
        "motions": [
            "BMH representative listens with care while seller starts to open up. Slow relationship-building conversation, no urgency marks.",
            "Seller relaxes slightly as the representative responds calmly. Keep both identities locked; no racing token.",
        ],
    },
}


def choose_duration(remaining: float, model: dict) -> int:
    opts = model["durationOptions"]
    max_d = model["maxDuration"]
    target = min(max_d, max(2.0, remaining))
    candidates = [o for o in opts if o >= target - 0.25]
    if candidates:
        return min(candidates)
    return max(opts)


def actual_model_for(queue_name: str, beat: str) -> str:
    if queue_name in MIXED_MODELS:
        cfg = MIXED_MODELS[queue_name]
        return cfg["overrides"].get(beat, cfg["default"])
    return queue_name


def queue_for(model_name: str, state: dict) -> dict:
    clips = []
    for beat, cfg in BEATS.items():
        actual_model = actual_model_for(model_name, beat)
        model = MODELS[actual_model]
        vo = float(state[beat]["duration"])
        count = math.ceil(vo / model["maxDuration"])
        remaining = vo
        for idx in range(count):
            dur = choose_duration(remaining, model)
            motion = cfg["motions"][min(idx, len(cfg["motions"]) - 1)]
            still = SCENES / cfg["still"]
            out = FULL_ROOT / model_name / f"{beat}_part{idx + 1:02d}.mp4"
            clips.append(
                {
                    "model": model_name,
                    "actualModel": actual_model,
                    "beat": beat,
                    "part": idx + 1,
                    "parts": count,
                    "voiceDuration": round(vo, 3),
                    "requestedDuration": dur,
                    "sourceStill": str(still),
                    "outputPath": str(out),
                    "transcriptContext": cfg["context"],
                    "motion": motion,
                    "prompt": f"{STYLE_LOCK} SCENE/MOTION: {motion} {NEGATIVE}",
                    "bakeoffReusableIfApproved": bool(cfg.get("bakeoffReusable") and idx == 0),
                }
            )
            remaining -= dur
    return {
        "lesson": "Module 04 Lesson 4B",
        "model": model_name,
        "mixedModelPolicy": MIXED_MODELS.get(model_name),
        "status": "queue only; do not run until Jarrad/Claude approves model",
        "outputDirectory": str(FULL_ROOT / model_name),
        "clips": clips,
    }


def write_markdown(queue: dict, path: Path) -> None:
    lines = [
        f"# Lesson 4B Animation Queue - {queue['model']}",
        "",
        "Status: queue only. Codex has not selected or approved this model.",
        "",
        f"Output directory: `{queue['outputDirectory']}`",
        "",
        "| Beat | Part | Duration | Output |",
        "|---|---:|---:|---|",
    ]
    for c in queue["clips"]:
        lines.append(f"| `{c['beat']}` | {c['part']}/{c['parts']} | {c['requestedDuration']}s | `{c['outputPath']}` |")
    path.write_text("\n".join(lines) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="all", choices=["all", *MODELS.keys(), *MIXED_MODELS.keys()])
    args = parser.parse_args()
    state = json.loads(STATE.read_text())
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    models = [*MODELS.keys(), *MIXED_MODELS.keys()] if args.model == "all" else [args.model]
    index = {}
    for model in models:
        q = queue_for(model, state)
        model_dir = OUT_ROOT / model
        model_dir.mkdir(parents=True, exist_ok=True)
        json_path = model_dir / "queue.json"
        md_path = model_dir / "queue.md"
        json_path.write_text(json.dumps(q, indent=2))
        write_markdown(q, md_path)
        index[model] = {"clips": len(q["clips"]), "json": str(json_path), "markdown": str(md_path)}
    (OUT_ROOT / "index.json").write_text(json.dumps(index, indent=2))
    print(json.dumps(index, indent=2))


if __name__ == "__main__":
    main()
