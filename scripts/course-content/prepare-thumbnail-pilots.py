#!/usr/bin/env python3
"""Create deterministic flat-palette thumbnail pilot derivatives.

The image model sources are retained verbatim. This script applies the locked
BMH Sticker System palette, then produces a no-crop 16:10 lesson card and a
16:9 video poster for review. It intentionally does not touch manifest paths.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "course-assets/thumbnails/pilots/sources"
MASTER_DIR = ROOT / "course-assets/thumbnails/pilots/flat-masters"
LESSON_DIR = ROOT / "course-assets/thumbnails/pilots/lesson-cards"
POSTER_DIR = ROOT / "course-assets/posters/pilots"
METADATA_PATH = ROOT / "docs/course-production/thumbnail-pilots/checksums.json"

ASSETS = ("orientation", "opening-the-call", "objection-architecture")

# Exact colors sampled from the canonical BMH sticker references. The eighth
# color is the single muted green allowed by the locked guide.
PALETTE = (
    (103, 182, 255),  # cornflower blue
    (255, 211, 1),    # golden yellow
    (255, 174, 1),    # amber
    (255, 110, 0),    # orange
    (254, 255, 198),  # cream
    (255, 255, 255),  # white
    (0, 0, 0),        # black
    (105, 153, 53),   # muted green
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def palette_image() -> Image.Image:
    palette = Image.new("P", (1, 1))
    flattened = [channel for color in PALETTE for channel in color]
    palette.putpalette(flattened + [0] * (768 - len(flattened)))
    return palette


def flatten(image: Image.Image) -> Image.Image:
    return image.convert("RGB").quantize(
        palette=palette_image(),
        dither=Image.Dither.NONE,
    ).convert("RGB")


def fit_16_9(image: Image.Image) -> Image.Image:
    resized = ImageOps.fit(
        image,
        (1280, 720),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )
    return flatten(resized)


def pad_16_10(image: Image.Image) -> Image.Image:
    target_height = math.ceil(image.width / 1.6)
    canvas = Image.new("RGB", (image.width, target_height), PALETTE[0])
    canvas.paste(image, (0, (target_height - image.height) // 2))
    resized = canvas.resize((1280, 800), Image.Resampling.LANCZOS)
    return flatten(resized)


def dimensions(path: Path) -> list[int]:
    with Image.open(path) as image:
        return [image.width, image.height]


def main() -> None:
    for directory in (MASTER_DIR, LESSON_DIR, POSTER_DIR, METADATA_PATH.parent):
        directory.mkdir(parents=True, exist_ok=True)

    records: list[dict[str, object]] = []
    for slug in ASSETS:
        source = SOURCE_DIR / f"{slug}-generated.png"
        master = MASTER_DIR / f"{slug}-flat-master.png"
        lesson = LESSON_DIR / f"{slug}-lesson-card-16x10.webp"
        poster = POSTER_DIR / f"{slug}-video-poster-16x9.webp"

        with Image.open(source) as loaded:
            flat = flatten(loaded)
            flat.save(master, format="PNG", optimize=True)
            pad_16_10(flat).save(lesson, format="WEBP", lossless=True, method=6)
            fit_16_9(flat).save(poster, format="WEBP", lossless=True, method=6)

        records.append(
            {
                "slug": slug,
                "source": {
                    "path": source.relative_to(ROOT).as_posix(),
                    "dimensions": dimensions(source),
                    "sha256": sha256(source),
                },
                "flat_master": {
                    "path": master.relative_to(ROOT).as_posix(),
                    "dimensions": dimensions(master),
                    "sha256": sha256(master),
                },
                "lesson_card": {
                    "path": lesson.relative_to(ROOT).as_posix(),
                    "dimensions": dimensions(lesson),
                    "sha256": sha256(lesson),
                },
                "video_poster": {
                    "path": poster.relative_to(ROOT).as_posix(),
                    "dimensions": dimensions(poster),
                    "sha256": sha256(poster),
                },
            }
        )

    METADATA_PATH.write_text(
        json.dumps(
            {
                "status": "pilot-awaiting-jarrad-approval",
                "generator": "built-in image_gen",
                "post_processing": "locked eight-color palette, no dithering",
                "palette_rgb": [list(color) for color in PALETTE],
                "assets": records,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
