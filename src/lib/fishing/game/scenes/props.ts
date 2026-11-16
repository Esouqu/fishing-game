import { Container, Graphics } from "pixi.js";
import type { AreaPalette } from "../../areas";
import { ditherNoise } from "./dither";

/**
 * Small pieces of the bank that every scene needs: the drift a tree stands in,
 * the stones lying on the snow, the reeds on the shore and the angler's pail.
 *
 * Both used to be a flat grey ellipse for the drift and a recoloured asset-pack
 * sprite for the stone. At the size the game draws them, the ellipse read as a
 * puddle or a shadow (the player could not tell which), and the rock sprite's
 * pointed facets read as a bomb with spikes. These are built the way the rest of
 * the scenery is lit — a lumpy snow shape with a lit crest, a faceted stone with
 * a lit face, a shaded side and a snow cap — so they read at a glance.
 */

/** Deterministic 0..1 noise, so previews match the live scene. */
function noise(a: number, b: number): number {
  return (ditherNoise(a, b) + 1) / 2;
}

/**
 * Scale the pail is drawn at. It is a background prop: big enough to read as a
 * bucket beside the boat, small enough that it never competes with the float.
 */
const BUCKET_SCALE = 1;

/**
 * A snowdrift, ~26 × 7 px at `scale` 1, sitting on `(x, y)`.
 *
 * The outline is a wavy half-ellipse rather than a clean oval: a drift is
 * something the wind piled up, and the bumps are what separate it from the
 * shadow it would otherwise be mistaken for.
 */
export function drawSnowDrift(
  props: Container,
  x: number,
  y: number,
  scale: number,
  palette: AreaPalette,
): void {
  const g = new Graphics();
  const w = 13 * scale;
  const h = 4.2 * scale;
  const seed = Math.round(x * 7 + y * 3);

  const top: number[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = Math.PI + t * Math.PI;
    // Two overlapping ripples keep the crest from looking extruded.
    const bump =
      1 +
      Math.sin(t * Math.PI * 3.1 + 0.6) * 0.14 +
      (noise(i + 1, seed) - 0.5) * 0.16;
    top.push(x + Math.cos(angle) * w, y - Math.sin(angle) * h * bump);
  }
  top.push(x + w, y + 0.6, x - w, y + 0.6);
  g.poly(top).fill({ color: palette.snow, alpha: 0.96 });

  // Shade along the foot of the drift, where it meets the ground.
  g.ellipse(x, y - 0.6, w * 0.92, h * 0.32).fill({
    color: palette.snowShade,
    alpha: 0.42,
  });
  // Lit crest on the windward side.
  g.ellipse(x - w * 0.24, y - h * 0.72, w * 0.4, h * 0.26).fill({
    color: palette.snowLight,
    alpha: 0.9,
  });
  // A couple of crystals, so the drift catches the eye as snow.
  for (let i = 0; i < 2; i += 1) {
    const px = x + (noise(i + 9, seed) - 0.5) * w * 1.2;
    const py = y - h * (0.4 + noise(i + 4, seed) * 0.5);
    g.rect(Math.round(px), Math.round(py), 1, 1).fill({
      color: palette.snowLight,
      alpha: 0.95,
    });
  }
  g.zIndex = y - 0.2;
  props.addChild(g);
}

/**
 * A clump of last year's reeds, ~20 px tall and ~18 px wide at `scale` 1.
 *
 * The river drew its own reeds inline; the lake needed the same plant on its
 * shore, so the drawing lives here and both waters use it. Winter reeds: dry
 * leaning stalks, a dark cattail head on the taller ones, snow caught on the
 * heads and a drift of snow at the foot.
 */
export function drawReedClump(
  props: Container,
  x: number,
  y: number,
  palette: AreaPalette,
  scale = 1,
  seed = 0,
): void {
  const g = new Graphics();
  const base = Math.round(x * 3 + y + seed * 17);
  const count = 6 + Math.round(noise(seed + 1, 3) * 4);

  for (let i = 0; i < count; i += 1) {
    // Stalks fan out from the clump's foot, so a group reads as one plant.
    const spread = count > 1 ? (i / (count - 1) - 0.5) * 2 : 0;
    const bx = x + spread * 6 * scale + (noise(i + 2, base) - 0.5) * 3;
    const height = (11 + noise(i + 5, base) * 9) * scale;
    const lean = (spread * 5 + (noise(i + 8, base) - 0.5) * 3) * scale;
    const tipX = bx + lean;
    const tipY = y - height;
    g.moveTo(bx, y)
      .lineTo(tipX, tipY)
      .stroke({
        width: 1,
        color: i % 3 === 0 ? 0x8f7a58 : 0x6b5b41,
        alpha: 0.88,
      });

    if (noise(i + 11, base) > 0.5) {
      // Cattail: a dark head under the tip, with a line of snow on top of it.
      g.rect(tipX - 1, tipY + 1, 3, 4).fill({ color: 0x4a3826, alpha: 0.95 });
      g.rect(tipX - 1, tipY + 2, 1, 2).fill({ color: 0x6f5637, alpha: 0.9 });
      g.rect(tipX - 1, tipY, 3, 1).fill({
        color: palette.snowLight,
        alpha: 0.85,
      });
    } else {
      // A spent seed plume: one dry pixel above the stalk.
      g.rect(tipX, tipY - 1, 1, 2).fill({ color: 0x8f7a58, alpha: 0.75 });
    }
  }

  // Snow the clump stands in, and a shadow of the stalks on it.
  g.ellipse(x, y + 1, 9 * scale, 2.4 * scale).fill({
    color: palette.snow,
    alpha: 0.7,
  });
  g.ellipse(x, y, 5.5 * scale, 1.3 * scale).fill({
    color: palette.snowLight,
    alpha: 0.8,
  });
  g.zIndex = y;
  props.addChild(g);
}

/**
 * A shore stone, ~16 px wide at `scale` 1, sitting on `(x, y)`.
 *
 * Faceted: an irregular silhouette with a lit upper-left face, a dark right
 * side, a dark waterline where it meets the ground and a snow cap on top, which
 * is also what keeps it from reading as a spiky ball.
 */
export function drawShoreStone(
  props: Container,
  x: number,
  y: number,
  scale: number,
  palette: AreaPalette,
): void {
  const g = new Graphics();
  const w = 8 * scale;
  const h = 7 * scale;
  const seed = Math.round(x * 13 + y * 5);
  const at = (u: number, v: number): [number, number] => [
    x + u * w + (noise(u + 2, seed) - 0.5) * 1.2,
    y - v * h + (noise(v + 7, seed) - 0.5) * 1.2,
  ];

  // Contact shadow, flattened on the snow.
  g.ellipse(x, y + 0.6, w * 1.05, h * 0.22).fill({
    color: 0x8fa6b4,
    alpha: 0.25,
  });

  const body = [
    ...at(-1, 0.12),
    ...at(-0.82, 0.62),
    ...at(-0.3, 0.98),
    ...at(0.32, 0.9),
    ...at(0.88, 0.5),
    ...at(0.98, 0.06),
    ...at(0.62, -0.08),
    ...at(-0.5, -0.06),
  ];
  g.poly(body).fill(0x66707c);

  // Lit face, top-left.
  g.poly([
    ...at(-0.86, 0.56),
    ...at(-0.34, 0.9),
    ...at(-0.1, 0.42),
    ...at(-0.55, 0.16),
  ]).fill(0x8b97a4);
  // Shaded right side.
  g.poly([
    ...at(0.3, 0.86),
    ...at(0.86, 0.46),
    ...at(0.62, 0.14),
    ...at(0.18, 0.5),
  ]).fill(0x4a525c);

  // Snow cap on the crown.
  g.poly([
    ...at(-0.62, 0.74),
    ...at(-0.16, 0.96),
    ...at(0.34, 0.78),
    ...at(0.02, 0.66),
  ]).fill({ color: palette.snow, alpha: 0.92 });

  g.poly(body).stroke({ width: 1, color: 0x2b323a, alpha: 0.85 });
  g.zIndex = y;
  props.addChild(g);
}

/**
 * The angler's pail, standing on `(x, y)` with its foot at `y`.
 *
 * The 16 px asset-pack sprite that used to stand here was a dark blue box with
 * stray pixels: at this size no amount of scaling made it read as a bucket next
 * to the drawn stones, reeds and drifts. It is drawn instead, the way the rest
 * of the bank is — an ink outline, a lit left side falling into a shaded right,
 * a pale steel rim and a blue lid of water inside, with one bright glint on the
 * metal. That is also what the reference art shows: a metal pail with water in
 * it, not a wooden barrel.
 */
export function drawBucket(
  props: Container,
  x: number,
  y: number,
  scale = BUCKET_SCALE,
): void {
  const g = new Graphics();
  /** Half width at the rim, at the foot, and the body height. */
  const w = 4.6 * scale;
  const foot = 3.6 * scale;
  const h = 8.4 * scale;
  const rim = 1.4 * scale;
  const top = y - h;

  // Contact shadow, tighter than the body so the pail sits in the snow.
  g.ellipse(x, y - 0.3 * scale, w * 1.02, 1.7 * scale).fill({
    color: 0x0a1c2a,
    alpha: 0.32,
  });

  // Body: a tapered pail, lit on the left, shaded on the right.
  const body = [x - foot, y, x + foot, y, x + w, top, x - w, top];
  g.poly(body).fill(0x7e8b99);
  g.poly([x - foot, y, x - foot * 0.2, y, x - w * 0.42, top, x - w, top]).fill(
    0xb2bcc6,
  );
  g.poly([x + foot * 0.3, y, x + foot, y, x + w, top, x + w * 0.35, top]).fill(
    0x58626f,
  );
  // One glint down the lit side, tapered so it reads as a reflection rather
  // than as a white stripe painted on.
  g.poly([
    x - w * 0.58,
    top + h * 0.12,
    x - w * 0.4,
    top + h * 0.12,
    x - w * 0.24,
    top + h * 0.58,
    x - w * 0.38,
    top + h * 0.58,
  ]).fill({ color: 0xf5ffe8, alpha: 0.55 });
  // The body's outline goes on before the rim: drawn after, its top edge
  // crossed the rim and left a heavy dark double band around the opening.
  g.poly(body).stroke({ width: 1, color: 0x14182e, alpha: 0.9 });

  // Pale steel rim holding a lid of water. This edge is what makes the shape
  // read as a bucket seen from above, so it is drawn last and stays crisp.
  g.ellipse(x, top + rim * 0.3, w, rim).fill(0xa3a7c2);
  g.ellipse(x, top + rim * 0.26, w * 0.72, rim * 0.6).fill(0x1b6fb5);
  g.ellipse(x - w * 0.24, top + rim * 0.05, w * 0.28, rim * 0.28).fill({
    color: 0x2ce8f5,
    alpha: 0.7,
  });
  g.ellipse(x, top + rim * 0.3, w, rim).stroke({
    width: 1,
    color: 0x14182e,
    alpha: 0.85,
  });

  g.zIndex = y;
  props.addChild(g);
}
