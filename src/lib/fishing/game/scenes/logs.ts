import type { Graphics } from "pixi.js";
import { clamp } from "../../utils";
import { mixColor } from "../../world";
import { ditherNoise } from "./dither";

/**
 * Waterlogged trunks, drawn once into the painted background.
 *
 * Reference: a floating log rides low. What the eye reads is a strip of wet,
 * weathered bark above the surface, a pale cut end, a bright waterline where the
 * water licks the wood, and a dark soft body just below it — the part that is
 * under water is *not* wood any more, it is a shadow through the water.
 *
 * The old art was two straight strokes in saturated red-brown: a plank lying on
 * the lake. This draws the trunk as a cylinder (a one-pixel lit ridge, a one
 * pixel wet shadow), cuts it off at the waterline instead of tinting the drowned
 * half, and breaks the silhouette with bark flakes so it never reads as a beam.
 */

/** Colours the trunk borrows from the water body it floats in. */
export interface LogPalette {
  ice: number;
  snow: number;
  snowLight: number;
}

/** Placement and proportions of one trunk. */
export interface LogShape {
  x: number;
  y: number;
  /** Direction of the trunk, radians. */
  angle: number;
  length: number;
  /** Half thickness at the root end (the cut face) and at the tip. */
  rootRadius?: number;
  tipRadius?: number;
  /**
   * 0..1 share of the trunk sitting below the waterline. A floating log is
   * mostly out of the water, so the default only drowns its lower third.
   */
  submerged?: number;
  /** Colour of that water; only read when the trunk is in the water. */
  water?: number;
  /** 0..1 snow lying along the upper side. */
  snow?: number;
  /** Sideways bend of the centreline, scene pixels. A real trunk is never straight. */
  bend?: number;
  /** Deterministic bark seed, so a preview matches the live scene. */
  seed?: number;
}

/**
 * Weathered bark: cold grey-brown, not the warm red-brown of sawn timber.
 *
 * The old palette was a saturated 0x6b5a44 body with a lit 0x9c8866 ridge. On
 * dark teal water that warm, evenly lit sausage read as anything but wood; a
 * dead trunk that has spent a winter in the lake has lost its warmth and reads
 * grey. The contrast now comes from the bark plates, not from the hue.
 */
const BARK = 0x6d6455;
const BARK_DARK = 0x40392f;
const BARK_LIT = 0x9b9284;
const BARK_RIDGE = 0x50483b;
const END_GRAIN = 0xb7ab92;
const END_GRAIN_DARK = 0x827663;
const OUTLINE = 0x191510;
/** Underwater bulk: the trunk's own dark, seen through the water. */
const HULL = 0x1c2a2c;

/** Points along a trunk edge; 8 samples read as a smooth taper at this size. */
const EDGE_STEPS = 8;
/**
 * Samples along the upper silhouette. Denser than {@link EDGE_STEPS} because
 * the bark flakes live on that edge and would be cut off by coarse sampling.
 */
const TOP_STEPS = 56;
/** Bark flakes lifted off the upper side: few on a clean trunk, more on a rough. */
const STUB_MIN = 3;
const STUB_SPREAD = 4;

export function drawFloatingLog(
  g: Graphics,
  shape: LogShape,
  palette: LogPalette,
): void {
  const length = Math.max(8, shape.length);
  const half = length / 2;
  const rootRadius = shape.rootRadius ?? 3.6;
  const tipRadius = shape.tipRadius ?? rootRadius * 0.8;
  // A floating trunk shows most of its body: the water only swallows the lower
  // quarter. The old 0.3 default left a 1.4-radius sliver above the surface,
  // which is a plank, not a log.
  const submerged = clamp(shape.submerged ?? 0.24);
  const snow = clamp(shape.snow ?? 0.8);
  const seed = shape.seed ?? 1;
  /** Gentle curve of the trunk. Deadfall is never a straight beam. */
  const bend = shape.bend ?? ditherNoise(seed, 7) * 1.1;
  /** Where the surface cuts the cylinder, as a share of its half thickness. */
  const waterShare = 1 - 2 * submerged;

  const cos = Math.cos(shape.angle);
  const sin = Math.sin(shape.angle);
  /** Trunk-local (along, across) -> scene coordinates. */
  const toWorld = (u: number, v: number): [number, number] => {
    const t = clamp((u + half) / length);
    const across = v + Math.sin(Math.PI * t) * bend;
    return [shape.x + u * cos - across * sin, shape.y + u * sin + across * cos];
  };
  const polyOf = (points: Array<[number, number]>): number[] => {
    const out: number[] = [];
    for (const [u, v] of points) {
      const [x, y] = toWorld(u, v);
      out.push(x, y);
    }
    return out;
  };
  /**
   * Half thickness at `u`: a taper, a belly, a little rot unevenness, and a
   * rounded cap at both ends. The cap matters: a trunk that stops on a flat
   * disc reads as a pipe, and a bright disc at the top of a vertical log reads
   * as a barrel standing on its end.
   */
  const radiusAt = (u: number): number => {
    const t = clamp((u + half) / (2 * half));
    const body =
      rootRadius +
      (tipRadius - rootRadius) * t +
      Math.sin(Math.PI * t) * 0.3 +
      Math.sin(t * Math.PI * 3 + seed) * 0.28;
    const cap = 0.55 + 0.45 * Math.min(1, Math.min(t, 1 - t) / 0.055);
    return body * cap;
  };
  /** Edge at `share` of the local half-thickness (-1 top .. 1 underside). */
  const edge = (
    from: number,
    to: number,
    share: number,
  ): Array<[number, number]> => {
    const points: Array<[number, number]> = [];
    for (let i = 0; i <= EDGE_STEPS; i += 1) {
      const u = from + ((to - from) * i) / EDGE_STEPS;
      points.push([u, radiusAt(u) * share]);
    }
    return points;
  };
  /** The waterline, which never climbs past the trunk's edge at the thin ends. */
  const waterline: Array<[number, number]> = [];
  for (let i = 0; i <= EDGE_STEPS; i += 1) {
    const u = -half + (length * i) / EDGE_STEPS;
    const radius = radiusAt(u);
    waterline.push([u, Math.min(radius * waterShare, radius - 0.5)]);
  }
  /** A closed strip of the cylinder between two shares. */
  const strip = (
    shareA: number,
    shareB: number,
    from = -half,
    to = half,
  ): Array<[number, number]> => [
    ...edge(from, to, shareA),
    ...edge(to, from, shareB),
  ];
  /**
   * Branch stubs and knots lifted off the upper side, as a lift on the edge
   * rather than as separate shapes.
   *
   * They used to be four identical trapezoids drawn on top of the finished
   * trunk, which put them outside the stroked outline (a stepped brown ladder
   * hanging off the top) and, being evenly spaced and evenly sized, made every
   * log look stamped from the same die. They are now part of the edge, and each
   * one is its own shape: a count that varies per log, uneven spacing, a
   * different width on each side, and a crest that is sometimes flat (a sawn
   * stub) and sometimes a point (a broken one).
   *
   * One of them is grown into a real broken branch. The sub-pixel flecks alone
   * left the silhouette a smooth brown sausage — the single shape the eye reads
   * fastest as "something that is not a tree". A branch that sticks up out of
   * the water is the cheapest, clearest "this is a fallen trunk" cue the scale
   * allows.
   */
  const stubCount =
    STUB_MIN + Math.round(Math.abs(ditherNoise(seed, 3)) * STUB_SPREAD);
  /** Index that grows into the branch; picked from the seed, so it varies. */
  const branchIndex = Math.round(
    Math.abs(ditherNoise(seed, 17)) * (stubCount - 1),
  );
  const stubs: Array<{
    centre: number;
    left: number;
    right: number;
    height: number;
    /** Share of the half-width taken by the shoulder, 0.15..0.9. */
    shoulder: number;
  }> = [];
  for (let i = 0; i < stubCount; i += 1) {
    const place = ditherNoise(i * 3 + 1, seed);
    const wide = ditherNoise(i * 5 + 2, seed + 7);
    const tall = ditherNoise(i * 7 + 3, seed + 13);
    const lean = ditherNoise(i * 11 + 4, seed + 29);
    // Positions are spread over 60% of the trunk with a jitter, so the gaps are
    // never equal — an evenly spaced row is what read as a stamped pattern.
    const span = (i + 0.5 + place * 0.9) / stubCount;
    const centre = -half * 0.8 + length * 0.66 * span;
    const branch = i === branchIndex;
    // Wide enough that the 1 px outline cannot swallow the whole stub; the
    // branch is deliberately narrow, so its outline *is* its silhouette.
    const width = branch
      ? 1.1 + Math.abs(wide) * 0.8
      : 2.2 + Math.abs(wide) * 3;
    stubs.push({
      centre,
      left: width * (1 - Math.max(0, lean) * 0.45),
      right: width * (1 + Math.min(0, lean) * 0.45),
      // Measured against the trunk's own thickness: a fleck that is a third of
      // the radius is a visible knot, and the branch is a third again taller.
      height: branch ? 2.1 + Math.abs(tall) * 1.5 : 0.6 + Math.abs(tall) * 1.2,
      shoulder: branch ? 0.22 : 0.2 + Math.abs(place) * 0.7,
    });
  }
  /** Trapezoid or spike: the crest follows the stub's own shoulder width. */
  const flakeLift = (u: number): number => {
    let lift = 0;
    for (const stub of stubs) {
      const reach = u < stub.centre ? stub.left : stub.right;
      const t = Math.abs(u - stub.centre) / reach;
      if (t >= 1) continue;
      lift = Math.max(lift, stub.height * Math.min(1, (1 - t) / stub.shoulder));
    }
    return lift;
  };
  /**
   * Upper silhouette: the taper, sampled coarsely, plus the stub corners. The
   * corners are real vertices — a densely sampled curve would round every stub
   * off into a lump and the top edge would read as a caterpillar.
   */
  const topUs: number[] = [];
  for (let i = 0; i <= TOP_STEPS; i += 1) {
    topUs.push(-half + (length * i) / TOP_STEPS);
  }
  for (const stub of stubs) {
    topUs.push(
      stub.centre - stub.left,
      stub.centre - stub.left * (1 - stub.shoulder),
      stub.centre + stub.right * (1 - stub.shoulder),
      stub.centre + stub.right,
    );
  }
  topUs.sort((a, b) => a - b);
  const topEdge: Array<[number, number]> = [];
  let previous = -Infinity;
  for (const u of topUs) {
    // Duplicates would draw a zero-length segment; the outline miter chokes on
    // those and spits out a spike.
    if (u - previous < 0.05) continue;
    previous = u;
    topEdge.push([u, -(radiusAt(u) + flakeLift(u))]);
  }
  /** Open path through trunk-local points. */
  const strokePath = (
    points: Array<[number, number]>,
    style: { width: number; color: number; alpha: number },
  ): void => {
    const flat = polyOf(points);
    g.moveTo(flat[0], flat[1]);
    for (let i = 2; i < flat.length; i += 2) g.lineTo(flat[i], flat[i + 1]);
    g.stroke(style);
  };
  const ellipse = (
    u: number,
    radiusAlong: number,
    radiusAcross: number,
    vCentre = 0,
  ): Array<[number, number]> => {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      points.push([
        u + Math.cos(angle) * radiusAlong,
        vCentre + Math.sin(angle) * radiusAcross,
      ]);
    }
    return points;
  };

  const above = polyOf([...topEdge, ...[...waterline].reverse()]);

  // --- the water answers the trunk first --------------------------------
  // The drowned bulk, seen through the surface. It is a shadow on the water, so
  // it is offset in *screen* space (down and slightly right), not perpendicular
  // to the trunk: a top-down lake does not light the log from its own side.
  const shiftX = 1.5;
  const shiftY = 2;
  const hull = polyOf([
    ...edge(-half, half, -0.92),
    ...edge(half, -half, 1),
  ]).map((value, index) => (index % 2 === 0 ? value + shiftX : value + shiftY));
  g.poly(hull).fill({
    color: mixColor(shape.water ?? HULL, HULL, 0.6),
    alpha: 0.34,
  });

  // Ripples break at the two ends, where the trunk cuts the surface, plus one
  // broken line along the waterline. A closed ring around the whole trunk reads
  // as a painted plate. A trunk lying on dry snow has no surface to break, so
  // none of this is drawn for it — it only gets the shadow above.
  //
  // One thin, water-tinted arc per end, not the pair of bright ice rings the
  // trunk used to wear: at this size two pale ellipses around a 9 px body made
  // the log glow, which is exactly what made it read as a soft floating lump
  // instead of a hard piece of wood.
  if (submerged > 0.01) {
    const ripple = mixColor(palette.ice, shape.water ?? HULL, 0.5);
    for (const sign of [-1, 1] as const) {
      const endU = sign * half * 0.9;
      const radius = radiusAt(sign * half);
      g.poly(
        polyOf(
          ellipse(endU, radius + 2.2, (radius + 2.2) * 0.55, radius * 0.35),
        ),
      ).stroke({
        width: 1,
        color: ripple,
        alpha: Math.max(0.06, 0.2 - submerged * 0.1),
      });
    }
  }

  // --- the trunk above the water ----------------------------------------
  g.poly(above).fill(BARK);
  // Cylinder light as pixel art: one lit ridge along the top and one wet shadow
  // just above the waterline. Wide alpha bands split the trunk in half and read
  // as a beam with a black side.
  g.poly(polyOf(strip(-1, -0.7))).fill(BARK_LIT);
  g.poly(polyOf(strip(Math.min(waterShare, 0.55), waterShare))).fill(BARK_DARK);

  // Bark plates: broad, uneven patches of a darker and a lighter tone running
  // along the body. One-pixel grain lines alone are not readable at this size —
  // they vanish into a single flat brown, which is what made the trunk look
  // like a smooth extruded sausage. Plates are what the eye actually reads as
  // bark from a metre away.
  const plateCount = Math.max(3, Math.round(length / 8));
  for (let i = 0; i < plateCount; i += 1) {
    const noise = ditherNoise(i + 61, seed);
    const centre = -half + (length * (i + 0.5)) / plateCount + noise * 2;
    const plateWidth = 2.4 + Math.abs(noise) * 3.2;
    const from = clamp(centre - plateWidth / 2, -half + 0.6, half - 0.6);
    const to = clamp(centre + plateWidth / 2, -half + 0.6, half - 0.6);
    if (to - from < 0.8) continue;
    const top = -0.86 + (i % 3) * 0.22 + Math.abs(noise) * 0.12;
    const bottom = Math.min(
      waterShare - 0.05,
      top + 0.42 + Math.abs(noise) * 0.3,
    );
    if (bottom <= top) continue;
    g.poly(polyOf(strip(top, bottom, from, to))).fill({
      color: noise > 0 ? BARK_RIDGE : BARK_LIT,
      alpha: noise > 0 ? 0.34 : 0.2,
    });
  }

  // Bark ridges run along the trunk, cracks cut across it. Deterministic, so
  // the menu preview and the live scene show the same log.
  //
  // The end point is expressed as a share of the thickness *there*, not as an
  // absolute offset: a fixed offset left the line hanging past the tapering
  // cap, a pale scratch floating above the contour.
  const grainCount = Math.max(4, Math.round(length / 6));
  for (let i = 0; i < grainCount; i += 1) {
    const noise = ditherNoise(i + 1, seed);
    const u = -half + (length * (i + 0.5)) / grainCount + noise * 1.6;
    const across = -0.9 + (i % 3) * 0.5;
    if (across > waterShare - 0.1) continue;
    const uEnd = u + 2.2 + Math.abs(noise) * 3.4;
    const endShare = clamp(across + noise * 0.12, -0.92, waterShare - 0.12);
    const from = toWorld(u, radiusAt(u) * across);
    const to = toWorld(uEnd, radiusAt(uEnd) * endShare);
    g.moveTo(from[0], from[1])
      .lineTo(to[0], to[1])
      .stroke({
        width: 1,
        color: noise > 0 ? BARK_RIDGE : BARK_LIT,
        alpha: noise > 0 ? 0.65 : 0.3,
      });
  }

  // Rough silhouette: the bark flakes are already part of `above` (see
  // `flakeLift`), so the fill and the outline agree on where the top edge is.

  // End grain: the pale cut face at the root end, and a darker broken one at
  // the tip. This is the single most "it is a piece of timber" feature at this
  // size — without it the trunk is a brown capsule.
  //
  // It also has to *fit*: the trunk tapers into a rounded cap and its lower
  // part is under water, so an ellipse sized off the body radius used to step
  // out past both the outline and the waterline and read as a little brown
  // ladder hanging off the end of every log. The face is measured on the slice
  // that is actually above the surface, and the old 0.55-radius clamp made it a
  // one-pixel sliver that nobody could see, which is how the trunk lost its cut
  // end in the first place.
  const face = (
    u: number,
    radiusAlong: number,
    acrossShare: number,
    fill: number,
    alpha: number,
  ): void => {
    const radius = radiusAt(u);
    /** The slice of trunk at `u` that is out of the water. */
    const top = -radius;
    const surface = Math.min(radius * waterShare, radius - 0.5);
    const across = Math.max(0.4, ((surface - top) / 2 - 0.2) * acrossShare);
    const centre = (top + surface) / 2;
    const rim = polyOf(ellipse(u, radiusAlong, across, centre));
    g.poly(rim).fill({ color: fill, alpha });
    g.poly(rim).stroke({ width: 1, color: OUTLINE, alpha: 0.35 });
  };
  face(half - 1.5, 1.3, 0.92, END_GRAIN, 0.92);
  face(-half + 1.2, 0.8, 0.72, END_GRAIN_DARK, 0.6);

  // --- snow --------------------------------------------------------------
  // Snow settles as crusty patches along the upper side. One continuous stroke
  // along the top edge reads as a highlight instead, and the dashes that
  // replaced it looked like a zip.
  //
  // Painted before the outline: a patch that reaches the silhouette used to be
  // laid over the finished contour, which left pale crumbs above the top edge.
  if (snow > 0.05) {
    for (let i = 0; i < 3; i += 1) {
      const noise = ditherNoise(i + 31, seed);
      const centre = -half * 0.6 + (length * 0.4 * i) / 2;
      const width = 2.4 + Math.abs(noise) * 3;
      const depth = 0.12 + Math.abs(ditherNoise(i + 5, seed)) * 0.14;
      const patch: Array<[number, number]> = [];
      const steps = 4;
      for (let k = 0; k <= steps; k += 1) {
        const u = centre - width + (2 * width * k) / steps;
        const radius = radiusAt(u);
        patch.push([u, -radius + radius * depth]);
      }
      for (let k = steps; k >= 0; k -= 1) {
        const u = centre - width + (2 * width * k) / steps;
        const radius = radiusAt(u);
        patch.push([u, -radius + (k % 2 === 0 ? 0.1 : 0.7)]);
      }
      g.poly(polyOf(patch)).fill({
        color: palette.snow,
        alpha: 0.6 * snow,
      });
    }
  }

  // --- waterline ---------------------------------------------------------
  // The bright lip is the single strongest "floating" cue: the surface climbs
  // the bark, so it catches the cold sky right where the wood leaves the water.
  // The contour is stroked last so nothing can end up outside it, and with a
  // round join: the bark humps are shallow, but a miter at their shoulders
  // still throws a spike a pixel or two clear of the log.
  g.poly(above).stroke({
    width: 1,
    color: OUTLINE,
    alpha: 0.85,
    join: "round",
  });
  if (submerged > 0.01) {
    strokePath(waterline, {
      width: 1,
      color: mixColor(palette.ice, palette.snowLight, 0.45),
      alpha: 0.5,
    });
    strokePath(
      waterline.map(([u, v]) => [u, v + 1] as [number, number]),
      { width: 1, color: HULL, alpha: 0.5 },
    );
  }
}
