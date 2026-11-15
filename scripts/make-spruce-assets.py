#!/usr/bin/env python3
"""Draw the two winter spruce sprites from code.

The old `tree-a`/`tree-b` were rounded broadleaf crowns, so every "fir" on the
lake and in the bay read as a green bubble and fought the hand-drawn conifers
of the river scene. The references for this pass are pixel spruces: a tall cone
of drooping boughs, each one a green band with a snow-covered top and a dark
shadow under it, over a short thick trunk.

Run from the repository root:

    python scripts/make-spruce-assets.py
"""

from __future__ import annotations

import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "src", "assets", "fishing")

CANVAS = (52, 60)

SNOW = (240, 248, 252, 255)
SNOW_LIGHT = (251, 254, 255, 255)
SNOW_SHADE = (203, 222, 233, 255)
SNOW_BLUE = (171, 198, 216, 255)

# Cold winter green. The lake and the bay tint the sprites towards teal, so the
# base stays neutral and lets the scene do the colour grading.
BODY = (44, 88, 74, 255)
LIT = (78, 136, 104, 255)
SHADE = (29, 63, 66, 255)
GAP = (17, 38, 41, 255)
RIM = (22, 48, 48, 255)
TIP = (62, 116, 92, 255)
UNDER = (36, 74, 70, 255)

BARK = (104, 78, 56, 255)
BARK_LIT = (146, 110, 76, 255)
BARK_SHADE = (68, 50, 40, 255)


def hash01(x: int, y: int) -> float:
    """Deterministic 0..1 noise, so a rebuild gives the same sprite."""
    return ((x * 73856093) ^ (y * 19349663)) % 1024 / 1024.0


def save(name: str, image: Image.Image) -> None:
    image.save(os.path.join(ASSETS, name))


def put(pixels, x: int, y: int, color) -> None:
    if 0 <= x < CANVAS[0] and 0 <= y < CANVAS[1]:
        pixels[x, y] = color


def draw_trunk(pixels, cx: int, top: int, bottom: int) -> None:
    """A short, thick trunk with a lit left edge and a root flare."""
    half = 2
    for y in range(top, bottom + 1):
        for x in range(cx - half, cx + half + 1):
            if x == cx - half:
                pixels[x, y] = BARK_LIT
            elif x == cx + half:
                pixels[x, y] = BARK_SHADE
            else:
                pixels[x, y] = BARK
    for x in range(cx - half - 1, cx + half + 2):
        pixels[x, bottom] = BARK_SHADE if x > cx else BARK
    put(pixels, cx - half - 1, bottom - 1, BARK)
    put(pixels, cx + half + 1, bottom - 1, BARK_SHADE)


def cone_half(y: int, crown_top: int, crown_bottom: int, max_half: float) -> float:
    """Half-width of the cone body at row `y`."""
    if y < crown_top:
        return 0.0
    t = min(1.0, (y - crown_top) / max(1.0, crown_bottom - crown_top))
    return max_half * t**0.82


def draw_spruce(
    name: str,
    tiers: int,
    max_half: float,
    crown_top: int,
    crown_bottom: int,
    trunk_top: int,
    trunk_bottom: int,
    snow_rows: int,
    taper: float,
    lean: int = 0,
) -> None:
    """One snow-laden spruce.

    The body is a dark cone; every tier is a bough band drawn on top of it, with
    snow along its upper edge, a lit green shoulder, and a gap of shadow under
    it. Bands are drawn bottom-up so each one overlaps the top of the cone and
    the one below it, which is what builds the stacked-bough silhouette.
    """
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    pixels = canvas.load()
    cx = CANVAS[0] // 2

    draw_trunk(pixels, cx, trunk_top, trunk_bottom)

    # Cone body: the dark green mass between the bough bands.
    for y in range(crown_top, crown_bottom + 1):
        half = cone_half(y, crown_top, crown_bottom, max_half)
        left = int(round(cx - half))
        right = int(round(cx + half))
        for x in range(left, right + 1):
            u = (x - cx) / max(1.0, half)
            # Light comes from the upper left: the left flank lifts, the right
            # flank goes dark. The seam dithers so no vertical line shows.
            if u < -0.25:
                color = BODY if hash01(x, y) > 0.55 else LIT
            elif u > 0.3:
                color = BODY if hash01(x, y + 3) > 0.45 else SHADE
            else:
                color = BODY
            pixels[x, y] = color

    span = crown_bottom - crown_top
    step = span / max(1.0, tiers - 0.1)

    for tier in range(tiers):
        # A pixel of jitter per tier: evenly spaced bands read as a machine
        # pattern instead of as a tree.
        y_line = crown_bottom - tier * step + (hash01(tier, 9) - 0.5) * 1.8
        half = max_half * (1.0 - (tier / max(1, tiers - 1)) * taper)
        # The boughs droop: the band's centre is higher than its tips.
        sag = max(1.0, half * 0.34)
        # Snow is never spread evenly over a tree: some boughs carry a thick
        # load, one or two are nearly bare.
        rows = snow_rows * (0.35 + hash01(tier * 5, 3) * 1.05)
        rows = max(0, min(int(round(rows)), 3))

        for x in range(int(round(cx - half)), int(round(cx + half)) + 1):
            u = (x - cx) / max(1.0, half)
            ridge = int(round(y_line - sag * (1.0 - u * u)))
            # Thicker in the middle of the bough, thinning towards the tips.
            thickness = max(1, int(round(2.2 + 1.8 * (1 - abs(u)))))
            # Branch tips hang a pixel lower every few columns: a sawtooth skirt.
            if (x * 5 + tier * 7) % 4 == 0:
                thickness += 1

            for d in range(thickness + 1):
                y = ridge + d
                if d <= rows - 1 and abs(u) < 0.9:
                    # Snow lying on the bough. It thins towards the shaded right
                    # tip and breaks into clumps instead of a clean stripe.
                    clump = hash01(x // 2, tier * 13)
                    if u > 0.3 and clump < 0.35 + u * 0.35:
                        continue
                    if d > 0 and (x * 3 + d) % 5 == 0:
                        continue
                    put(pixels, x, y, SNOW_LIGHT if d == 0 else SNOW)
                elif d == rows:
                    put(pixels, x, y, LIT)
                elif d >= thickness:
                    put(pixels, x, y, SHADE)
                else:
                    put(pixels, x, y, UNDER if d > rows else BODY)
            # Gap of shadow under the bough.
            put(pixels, x, ridge + thickness + 1, GAP)
            # An icy pixel hanging off the underside of the snow line.
            if hash01(x, tier * 5) > 0.8:
                put(pixels, x, ridge + rows + 1, SNOW_BLUE)
        # Bough tips poke out past the cone on both sides.
        for x in (int(round(cx - half)), int(round(cx + half))):
            put(pixels, x, int(round(y_line)), TIP)

    # A lean: the crown above the trunk is pushed sideways row by row, so the
    # tree grows at an angle instead of standing like a stamp.
    if lean != 0:
        snapshot = canvas.copy().load()
        for y in range(crown_top, trunk_top):
            dx = round(lean * (trunk_top - y) / max(1, trunk_top - crown_top))
            if dx == 0:
                continue
            for x in range(CANVAS[0]):
                pixels[x, y] = (0, 0, 0, 0)
            for x in range(CANVAS[0]):
                nx = x + dx
                if 0 <= nx < CANVAS[0]:
                    pixels[nx, y] = snapshot[x, y]

    # Snow cap on the crown: the topmost opaque pixel of every column.
    for x in range(CANVAS[0]):
        top = None
        for y in range(CANVAS[1]):
            if pixels[x, y][3] > 160:
                top = y
                break
        if top is None:
            continue
        depth = 1 + (1 if hash01(x, top) > 0.4 else 0)
        for d in range(depth):
            y = top + d
            if y >= CANVAS[1] or pixels[x, y][3] < 200:
                break
            pixels[x, y] = SNOW_LIGHT if d == 0 else SNOW

    # Dark rim on the silhouette. Snow keeps its brightness, so the tree still
    # separates from the snowfield behind it.
    rimmed = canvas.copy()
    out = rimmed.load()
    for y in range(CANVAS[1]):
        for x in range(CANVAS[0]):
            pixel = pixels[x, y]
            if pixel[3] < 200:
                continue
            if pixel in (SNOW, SNOW_LIGHT, SNOW_SHADE, SNOW_BLUE):
                continue
            for ox, oy in ((-1, 0), (1, 0), (0, 1)):
                nx, ny = x + ox, y + oy
                outside = not (0 <= nx < CANVAS[0] and 0 <= ny < CANVAS[1])
                if outside or pixels[nx, ny][3] < 120:
                    out[x, y] = RIM
                    break

    save(name, rimmed)


def main() -> None:
    # Taller, snow on every bough: the tree that frames the lake.
    draw_spruce(
        "tree-a.png",
        tiers=5,
        max_half=16.5,
        crown_top=3,
        crown_bottom=53,
        trunk_top=47,
        trunk_bottom=58,
        snow_rows=2,
        taper=0.7,
    )
    # A slightly wider, less loaded spruce, so a row of them is not a stamp.
    draw_spruce(
        "tree-b.png",
        tiers=4,
        max_half=18.0,
        crown_top=7,
        crown_bottom=53,
        trunk_top=47,
        trunk_bottom=58,
        snow_rows=1,
        taper=0.62,
    )
    # The odd one out: a squat, many-tiered spruce with a bent crown and a thin
    # dusting of snow. Distinct in silhouette, but the same palette and the same
    # bough construction, so it sits in the row instead of jumping out of it.
    draw_spruce(
        "tree-c.png",
        tiers=7,
        max_half=15.0,
        crown_top=7,
        crown_bottom=54,
        trunk_top=48,
        trunk_bottom=58,
        snow_rows=1,
        taper=0.78,
        lean=2,
    )


if __name__ == "__main__":
    main()
