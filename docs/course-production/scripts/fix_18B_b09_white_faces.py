#!/usr/bin/env python3
import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

ROOT = Path(BMH_ROOT)
SCENES = ROOT / "course-assets/scenes/module-18-lesson18B"
SRC_STILL = SCENES / "m18_L18B_b09_daily-standup.png"
DST_STILL = SCENES / "white-skin-fixes/m18_L18B_b09_daily-standup.png"
SRC_VIDEO = ROOT / "course-assets/heygen/lesson18B/seedance-v2-white-skin/b09_daily_standup.mp4"
DST_VIDEO = ROOT / "course-assets/heygen/lesson18B/seedance-v3-white-skin-fixes/b09_daily_standup.mp4"

# Three small avatar circles in the 1280x720 Seedance plate.
VIDEO_CIRCLES = [(420, 623, 67), (633, 623, 67), (844, 623, 67)]


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def scaled_circles(width: int, height: int) -> list[tuple[float, float, float]]:
    sx = width / 1280
    sy = height / 720
    sr = (sx + sy) / 2
    return [(x * sx, y * sy, r * sr) for x, y, r in VIDEO_CIRCLES]


def is_pale_fill(r: int, g: int, b: int) -> bool:
    # Confined to avatar circles, so this turns cream face/badge fill white
    # without touching orange/yellow shirts, black linework, or blue backdrop.
    return r >= 170 and g >= 155 and b >= 105 and (r - b) <= 95 and (g - b) <= 95


def whiten_avatar_fills(src: Path, dst: Path) -> None:
    image = Image.open(src).convert("RGBA")
    px = image.load()
    width, height = image.size
    circles = scaled_circles(width, height)

    for cx, cy, radius in circles:
        min_x = max(0, int(cx - radius - 1))
        max_x = min(width - 1, int(cx + radius + 1))
        min_y = max(0, int(cy - radius - 1))
        max_y = min(height - 1, int(cy + radius + 1))
        radius_sq = radius ** 2
        for y in range(min_y, max_y + 1):
            dy_sq = (y - cy) ** 2
            for x in range(min_x, max_x + 1):
                if (x - cx) ** 2 + dy_sq > radius_sq:
                    continue
                r, g, b, a = px[x, y]
                if a and is_pale_fill(r, g, b):
                    px[x, y] = (255, 255, 255, a)

    dst.parent.mkdir(parents=True, exist_ok=True)
    image.save(dst)


def patch_video() -> None:
    DST_VIDEO.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="lesson18b-b09-white-") as td:
        tmp = Path(td)
        raw = tmp / "raw"
        patched = tmp / "patched"
        raw.mkdir()
        patched.mkdir()

        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(SRC_VIDEO), str(raw / "frame_%04d.png")])
        for frame in sorted(raw.glob("frame_*.png")):
            whiten_avatar_fills(frame, patched / frame.name)
        run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-framerate",
                "24",
                "-i",
                str(patched / "frame_%04d.png"),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(DST_VIDEO),
            ]
        )


def main() -> None:
    if not SRC_STILL.exists():
        raise FileNotFoundError(SRC_STILL)
    if not SRC_VIDEO.exists():
        raise FileNotFoundError(SRC_VIDEO)
    whiten_avatar_fills(SRC_STILL, DST_STILL)
    patch_video()
    print(DST_STILL)
    print(DST_VIDEO)


if __name__ == "__main__":
    main()
