#!/usr/bin/env python3
"""Rebuild the bush and the rocks as padded winter versions.

The original sprites were generated in code (no AI art). This script keeps the
same silhouettes and pixel palette, restores the crowns that were clipped by
the canvas edge, adds a transparent margin and paints snow caps on the foliage
and rocks.

The two spruces used to be rebuilt here as well, as recoloured broadleaf
crowns. They are now drawn from scratch by `make-spruce-assets.py`, which owns
`tree-a.png` and `tree-b.png`; this script only handles the bush and the rocks
so regenerating nothing puts the old round crowns back. Run from the repository
root:

    python scripts/make-nature-assets.py
"""

from __future__ import annotations

import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "src", "assets", "fishing")
ORIGINALS = os.path.join(ROOT, "scripts", "nature-originals")

SNOW = (238, 246, 250, 255)
SNOW_LIGHT = (249, 252, 254, 255)
SNOW_SHADE = (203, 222, 233, 255)
SNOW_BLUE = (171, 198, 216, 255)
ICE = (190, 232, 242, 255)
ICE_DEEP = (137, 199, 216, 255)


def load(name: str) -> Image.Image:
    return Image.open(os.path.join(ORIGINALS, name)).convert("RGBA")


def save(name: str, image: Image.Image) -> None:
    image.save(os.path.join(ASSETS, name))


def color_map(image: Image.Image, mapping: dict[tuple[int, int, int], tuple[int, int, int, int]]) -> Image.Image:
    """Replace RGB values while keeping alpha and any unmapped colours."""
    out = image.copy()
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            replacement = mapping.get((r, g, b))
            if replacement is not None:
                pixels[x, y] = replacement
    return out


BUSH_MAP = {
    (59, 125, 79): (55, 113, 93, 255),
    (27, 47, 38): (21, 41, 47, 255),
    (99, 171, 63): (93, 159, 117, 255),
    (143, 191, 74): (158, 201, 205, 255),
    (215, 232, 160): SNOW_SHADE,
}

ROCK_A_MAP = {
    (104, 111, 153): (112, 124, 150, 255),
    (34, 38, 61): (28, 38, 53, 255),
    (76, 104, 133): (91, 117, 143, 255),
    (163, 167, 194): (188, 208, 221, 255),
    (223, 224, 232): SNOW_LIGHT,
    (16, 36, 28): (54, 88, 110, 90),
}

ROCK_B_MAP = {
    (76, 104, 133): (93, 119, 144, 255),
    (123, 130, 158): (131, 146, 166, 255),
    (34, 38, 61): (28, 38, 53, 255),
    (163, 167, 194): (190, 210, 223, 255),
    (223, 224, 232): SNOW_LIGHT,
    (59, 125, 79): (57, 111, 92, 255),
    (16, 36, 28): (54, 88, 110, 90),
}


def remove_specks(image: Image.Image) -> None:
    """Drop one-pixel islands and translucent fringe dots from the silhouette."""
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            neighbours = 0
            for oy in (-1, 0, 1):
                for ox in (-1, 0, 1):
                    if ox == 0 and oy == 0:
                        continue
                    nx, ny = x + ox, y + oy
                    if 0 <= nx < width and 0 <= ny < height and pixels[nx, ny][3] > 60:
                        neighbours += 1
            if a < 40 or (a >= 200 and neighbours <= 1):
                pixels[x, y] = (0, 0, 0, 0)


def pad(image: Image.Image, width: int, height: int, offset_x: int, offset_y: int) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.alpha_composite(image, (offset_x, offset_y))
    return canvas


def snow_cap(image: Image.Image, fraction: float, max_depth: int = 2) -> None:
    """Paint snow on upward-facing pixels only, not down the vertical sides."""
    pixels = image.load()
    width, height = image.size
    tops: dict[int, int] = {}
    for x in range(width):
        for y in range(height):
            if pixels[x, y][3] > 160:
                tops[x] = y
                break
    if not tops:
        return
    min_top = min(tops.values())
    max_top = max(tops.values())
    cutoff = min_top + max(1, round((max_top - min_top) * fraction))

    for x, top_y in tops.items():
        if top_y > cutoff:
            continue
        depth = 1 + (1 if (x * 7 + top_y) % 5 == 0 else 0)
        if (x * 11 + top_y) % 17 == 0:
            depth += 1
        depth = min(depth, max_depth)
        for d in range(depth):
            y = top_y + d
            if y >= height or pixels[x, y][3] < 200:
                break
            pixels[x, y] = SNOW if d == 0 else SNOW_SHADE
        if (x * 13 + top_y) % 23 == 0 and top_y + 2 < height:
            if pixels[x, top_y + 2][3] > 160:
                pixels[x, top_y + 2] = SNOW_BLUE


def winterize_bush() -> None:
    source = color_map(load("bush-a.png"), BUSH_MAP)
    canvas = pad(source, 17, 15, 1, 1)
    remove_specks(canvas)
    snow_cap(canvas, 0.55, 2)
    save("bush-a.png", canvas)


def winterize_rock(name: str, mapping: dict) -> None:
    source = color_map(load(name), mapping)
    canvas = pad(source, 17, 17, 1, 1)
    remove_specks(canvas)
    snow_cap(canvas, 0.5, 2)
    pixels = canvas.load()
    for x in range(canvas.width):
        column = [y for y in range(canvas.height) if pixels[x, y][3] > 0]
        if not column:
            continue
        top_y = column[0]
        # A thin icy rim near the ground.
        if top_y + 8 < canvas.height and (x + top_y) % 4 == 0:
            if pixels[x, top_y + 8][3] > 0:
                pixels[x, top_y + 8] = ICE
    save(name, canvas)


def main() -> None:
    winterize_bush()
    winterize_rock("rock-a.png", ROCK_A_MAP)
    winterize_rock("rock-b.png", ROCK_B_MAP)


if __name__ == "__main__":
    main()
