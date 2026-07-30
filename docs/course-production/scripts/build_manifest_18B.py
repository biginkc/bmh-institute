#!/usr/bin/env python3
import os
import json
import math
import shutil
import subprocess
import wave
from pathlib import Path

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

ROOT = Path(BMH_ROOT)
SRC = ROOT / "course-assets/heygen/lesson18B"
SCENES = ROOT / "course-assets/scenes/module-18-lesson18B"
REMOTION = ROOT / "docs/course-production/remotion"
PUBLIC = REMOTION / "public/lesson18B"
FPS = 30
GAP_SECONDS = 1.0
GAP_FRAMES = 30

BEATS = [
    "b01_command_center",
    "b02_county_channels",
    "b03_approval_flow",
    "b04_quality_check",
    "b05_handoff_thread",
    "b06_sandra_packet",
    "b07_dual_handoff",
    "b08_response_loop",
    "b09_daily_standup",
    "b10_ask_manager",
    "b11_team_norms",
    "b12_wins_momentum",
    "b13_systems_wrap",
    "b14_roleplay_career_tease",
]

STILLS = {
    "b02_county_channels": "m18_L18B_b02_county-channels.png",
    "b04_quality_check": "m18_L18B_b04_quality-check.png",
    "b05_handoff_thread": "m18_L18B_b05_handoff-thread.png",
    "b06_sandra_packet": "m18_L18B_b06_sandra-packet.png",
    "b07_dual_handoff": "m18_L18B_b07_dual-handoff.png",
    "b08_response_loop": "m18_L18B_b08_response-loop.png",
    "b09_daily_standup": "white-skin-fixes/m18_L18B_b09_daily-standup.png",
    "b10_ask_manager": "m18_L18B_b10_ask-manager.png",
    "b12_wins_momentum": "m18_L18B_b12_wins-momentum.png",
}

ANIMS = {
    "b02_county_channels": SRC / "seedance-v2-white-skin/b02_county_channels_remotion_pulse.mp4",
    "b04_quality_check": SRC / "seedance-v2-white-skin/b04_quality_check.mp4",
    "b05_handoff_thread": SRC / "seedance-v2-white-skin/b05_handoff_thread.mp4",
    "b07_dual_handoff": SRC / "seedance/b07_dual_handoff.mp4",
    "b09_daily_standup": SRC / "seedance-v3-white-skin-fixes/b09_daily_standup.mp4",
    "b10_ask_manager": SRC / "seedance-v2-white-skin/b10_ask_manager.mp4",
    "b12_wins_momentum": SRC / "seedance-v2-white-skin/b12_wins_momentum.mp4",
}

HEROES = {
    "b01_command_center": SRC / "hero_b01_command_center.mp4",
    "b14_roleplay_career_tease": SRC / "hero_b14_roleplay_career_tease_v7_split.mp4",
}

MODES = {
    "b01_command_center": "hero",
    "b02_county_channels": "video",
    "b03_approval_flow": "smsExchange",
    "b04_quality_check": "video",
    "b05_handoff_thread": "video",
    "b06_sandra_packet": "scene",
    "b07_dual_handoff": "video",
    "b08_response_loop": "video",
    "b09_daily_standup": "video",
    "b10_ask_manager": "video",
    "b11_team_norms": "norms",
    "b12_wins_momentum": "video",
    "b13_systems_wrap": "systems",
    "b14_roleplay_career_tease": "hero",
}

LABELS = {
    # Global rule 3c: lesson openers carry no text labels or stickers, BMH badge only.
    "b01_command_center": [],
    "b02_county_channels": [
        {"text": "COUNTY CHANNELS", "delay": 45, "place": "top", "role": "label"},
        {"text": "ORGANIZED BY MARKET", "delay": 470, "place": "bottom", "role": "caption"},
    ],
    "b03_approval_flow": [
        {"text": "DRAFT TEXT", "delay": 55, "place": "bottom", "role": "label"},
        {"text": "MANAGER REVIEW", "delay": 245, "place": "bottom", "role": "caption"},
        {"text": "APPROVED TO SEND", "delay": 430, "place": "bottom", "role": "caption"},
    ],
    "b04_quality_check": [
        {"text": "TONE", "delay": 115, "place": "topLeft", "role": "label"},
        {"text": "CONTENT", "delay": 150, "place": "top", "role": "label"},
        {"text": "TIMING", "delay": 190, "place": "topRight", "role": "label"},
        {"text": "QUALITY CHECK", "delay": 430, "place": "bottom", "role": "caption"},
    ],
    "b05_handoff_thread": [
        {"text": "USE THREADS", "delay": 195, "place": "top", "role": "label"},
        {"text": "TAG THE RIGHT PEOPLE", "delay": 275, "place": "bottom", "role": "caption"},
        {"text": "FULL NOTES IN SANDRA", "delay": 520, "place": "topRight", "role": "caption"},
    ],
    "b06_sandra_packet": [
        {"text": "PUSH TO SANDRA FIRST", "delay": 80, "place": "top", "role": "label"},
        {"text": "PROFILE", "delay": 255, "place": "left", "role": "caption"},
        {"text": "MOTIVATION", "delay": 350, "place": "right", "role": "caption"},
        {"text": "HOT BUTTONS", "delay": 630, "place": "bottom", "role": "caption"},
    ],
    "b07_dual_handoff": [
        {"text": "CRM DATA + SLACK NOTIFICATION", "delay": 22, "place": "top", "role": "label"},
        {"text": "NOTHING FALLS THROUGH", "delay": 255, "place": "bottom", "role": "caption"},
    ],
    "b08_response_loop": [
        {"text": "LOG IT IMMEDIATELY", "delay": 145, "place": "top", "role": "label"},
        {"text": "POST IN COUNTY CHANNEL", "delay": 260, "place": "left", "role": "caption"},
        {"text": "TAG IF NEEDED", "delay": 475, "place": "bottom", "role": "caption"},
    ],
    "b09_daily_standup": [
        {"text": "3-5 LINES", "delay": 360, "place": "top", "role": "label"},
        {"text": "SHORT DAILY STANDUP", "delay": 20, "place": "bottom", "role": "caption"},
    ],
    "b10_ask_manager": [
        {"text": "DON'T GUESS", "delay": 330, "place": "top", "role": "label"},
        {"text": "TAG YOUR MANAGER", "delay": 530, "place": "bottom", "role": "caption"},
        {"text": "KEEP WORKING OTHER LEADS", "delay": 780, "place": "topRight", "role": "caption"},
    ],
    "b12_wins_momentum": [
        {"text": "POST THE WIN", "delay": 160, "place": "top", "role": "label"},
        {"text": "WINS BUILD MOMENTUM", "delay": 300, "place": "bottom", "role": "caption"},
    ],
    "b14_roleplay_career_tease": [
        {"text": "ROLEPLAY: FAMILY DYNAMICS", "delay": 115, "place": "top", "role": "label"},
        {"text": "NEXT: CAREER GROWTH PATH", "delay": 475, "place": "bottom", "role": "caption"},
    ],
}

NORM_ROWS = [
    {"text": "OVER-COMMUNICATE", "delay": 80},
    {"text": "RESPOND WITHIN THE HOUR", "delay": 420},
    {"text": "KEEP IT PROFESSIONAL", "delay": 575},
]

SYSTEM_ROWS = [
    {"text": "CRM: LEADS + DATA", "delay": 48},
    {"text": "SLACK: COMMUNICATION", "delay": 150},
    {"text": "DIALPAD: CALLS", "delay": 244},
]


def run(cmd):
    subprocess.run(cmd, check=True)


def duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", str(path)],
        text=True,
    ).strip()
    return float(out)


def frames_for(path: Path) -> int:
    return int(round(duration(path) * FPS))


def make_gap(path: Path):
    params = None
    first = SRC / f"{BEATS[0]}.wav"
    with wave.open(str(first), "rb") as wav:
        params = wav.getparams()
        channels = wav.getnchannels()
        sampwidth = wav.getsampwidth()
        framerate = wav.getframerate()
    frames = int(framerate * GAP_SECONDS)
    silence = b"\x00" * frames * channels * sampwidth
    with wave.open(str(path), "wb") as wav:
        wav.setparams(params)
        wav.writeframes(silence)


def copy(src: Path, dst: Path):
    if not src.exists():
        raise FileNotFoundError(src)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def extract_tail(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-sseof", "-0.08", "-i", str(src), "-frames:v", "1", "-pix_fmt", "rgba", str(dst)])


def main():
    for sub in ["audio", "hero", "anim", "stills", "tails"]:
        (PUBLIC / sub).mkdir(parents=True, exist_ok=True)

    gap = PUBLIC / "audio/gap.wav"
    make_gap(gap)
    concat = PUBLIC / "audio/_concat.txt"
    lines = []
    for i, beat in enumerate(BEATS):
        wav = SRC / f"{beat}.wav"
        if not wav.exists():
            raise FileNotFoundError(wav)
        copy(wav, PUBLIC / f"audio/{beat}.wav")
        lines.append(f"file '{(PUBLIC / f'audio/{beat}.wav').resolve()}'")
        if i < len(BEATS) - 1:
            lines.append(f"file '{gap.resolve()}'")
    concat.write_text("\n".join(lines) + "\n")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(concat), "-c:a", "aac", "-b:a", "192k", str(PUBLIC / "master.m4a")])

    beats = []
    for i, tag in enumerate(BEATS):
        wav = SRC / f"{tag}.wav"
        vo_frames = frames_for(wav)
        beat = {
            "tag": tag,
            "mode": MODES[tag],
            "durationInFrames": vo_frames + (GAP_FRAMES if i < len(BEATS) - 1 else 0),
            "voFrames": vo_frames,
            "labels": [] if i == 0 else LABELS.get(tag, []),
        }
        if tag in HEROES:
            dst = PUBLIC / f"hero/{tag}.mp4"
            copy(HEROES[tag], dst)
            beat["hero"] = f"lesson18B/hero/{tag}.mp4"
            if tag == "b01_command_center":
                beat["badge"] = True
        if tag in STILLS:
            dst = PUBLIC / f"stills/{tag}.png"
            copy(SCENES / STILLS[tag], dst)
            beat["still"] = f"lesson18B/stills/{tag}.png"
        if tag in ANIMS:
            dst = PUBLIC / f"anim/{tag}.mp4"
            copy(ANIMS[tag], dst)
            tail = PUBLIC / f"tails/{tag}_tail.png"
            extract_tail(dst, tail)
            beat["anim"] = f"lesson18B/anim/{tag}.mp4"
            beat["tail"] = f"lesson18B/tails/{tag}_tail.png"
            beat["animFrames"] = frames_for(dst)
        if tag == "b11_team_norms":
            beat["rows"] = NORM_ROWS
        if tag == "b13_systems_wrap":
            beat["rows"] = SYSTEM_ROWS
        beats.append(beat)

    manifest = {
        "fps": FPS,
        "gapFrames": GAP_FRAMES,
        "audio": "lesson18B/master.m4a",
        "beats": beats,
        "totalFrames": sum(b["durationInFrames"] for b in beats),
        "notes": {
            "b02": "Approved Remotion/code map pulse. Rejected Seedance county-map candidates are not referenced.",
            "b03": "Remotion/code two-phone SMS exchange. Rejected generated approval-flow clip is not referenced.",
            "b04": "Approved simplified quality-check Seedance clip. Rejected clutter/checklist candidates are not referenced.",
            "b08": "Static deterministic response-loop plate. Generated b08 clip with hallucinated header text is not referenced.",
            "b14": "QC v6 freeze fallback rejected for talking hero. v7 uses two short HeyGen takes, straight-cut mid-beat, with no freeze fallback.",
        },
    }
    (PUBLIC / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"totalFrames": manifest["totalFrames"], "seconds": round(manifest["totalFrames"] / FPS, 3)}, indent=2))


if __name__ == "__main__":
    main()
