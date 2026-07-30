from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


SCENE_DIR = Path(
    "/Users/jarradhenry/Sites/BMH apps/BMH Institute/"
    "course-assets/scenes/module-06-lesson6B"
)
CANONICAL_BLUE = (0x62, 0xB3, 0xF3)


def normalize_connected_background(path: Path) -> None:
    image = Image.open(path).convert("RGB")
    pixels = image.load()
    width, height = image.size
    seen = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def close_to_blue(rgb: tuple[int, int, int]) -> bool:
        return sum((channel - target) ** 2 for channel, target in zip(rgb, CANONICAL_BLUE)) <= 38**2

    for x in range(width):
        for y in (0, height - 1):
            if close_to_blue(pixels[x, y]):
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if close_to_blue(pixels[x, y]):
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if seen[index] or not close_to_blue(pixels[x, y]):
            continue
        seen[index] = 1
        pixels[x, y] = CANONICAL_BLUE
        if x:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))

    image.save(path)


def median_background(image: Image.Image, box: tuple[int, int, int, int]) -> tuple[int, int, int]:
    crop = image.crop(box).convert("RGB")
    colors = []
    for red, green, blue in crop.getdata():
        if red + green + blue > 220 and max(red, green, blue) - min(red, green, blue) > 25:
            colors.append((red, green, blue))
        elif red + green + blue > 420:
            colors.append((red, green, blue))
    if not colors:
        raise RuntimeError(f"No usable background sample in {box}")
    colors.sort()
    return colors[len(colors) // 2]


def derive_form_states() -> None:
    master_path = SCENE_DIR / "m06_L6B_b02_form_06.png"
    master = Image.open(master_path).convert("RGB")
    fields = [
        ((120, 74, 145, 188), (525, 72, 1555, 190)),
        ((120, 214, 145, 328), (635, 214, 1555, 329)),
        ((120, 349, 145, 464), (700, 349, 1555, 465)),
        ((120, 487, 145, 604), (585, 487, 1555, 604)),
        ((120, 626, 145, 744), (675, 626, 1555, 744)),
        ((120, 765, 145, 872), (485, 765, 1555, 872)),
    ]
    fills = [median_background(master, sample) for sample, _ in fields]
    visible_counts = {1: 0, 2: 2, 3: 3, 4: 4, 5: 5}

    for state_number, visible_count in visible_counts.items():
        state = master.copy()
        draw = ImageDraw.Draw(state)
        for field_index in range(visible_count, len(fields)):
            draw.rectangle(fields[field_index][1], fill=fills[field_index])
        state.save(SCENE_DIR / f"m06_L6B_b02_form_{state_number:02d}.png")


def derive_check_states() -> None:
    master_path = SCENE_DIR / "m06_L6B_b06_check_10.png"
    master = Image.open(master_path).convert("RGB")
    checkbox_interiors = [
        (536, 156, 588, 200),
        (537, 235, 589, 278),
        (538, 315, 590, 358),
        (538, 394, 591, 437),
        (538, 472, 591, 514),
        (539, 548, 591, 589),
        (539, 623, 592, 663),
        (539, 696, 592, 736),
        (539, 769, 592, 808),
        (540, 843, 593, 885),
    ]
    fill = median_background(master, (610, 140, 625, 910))

    for state_number in range(10):
        state = master.copy()
        draw = ImageDraw.Draw(state)
        for checkbox_index in range(state_number, len(checkbox_interiors)):
            draw.rectangle(checkbox_interiors[checkbox_index], fill=fill)
        state.save(SCENE_DIR / f"m06_L6B_b06_check_{state_number:02d}.png")


def main() -> None:
    masters = [
        SCENE_DIR / "m06_L6B_b02_form_06.png",
        SCENE_DIR / "m06_L6B_b03_briefam.png",
        SCENE_DIR / "m06_L6B_b04_transfer.png",
        SCENE_DIR / "m06_L6B_b05_frame.png",
        SCENE_DIR / "m06_L6B_b06_check_10.png",
        SCENE_DIR / "m06_L6B_b07_killers.png",
    ]
    for master in masters:
        normalize_connected_background(master)
    derive_form_states()
    derive_check_states()


if __name__ == "__main__":
    main()
