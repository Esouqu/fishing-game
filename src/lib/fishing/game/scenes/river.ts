import { Container, Graphics, Sprite } from "pixi.js";
import type { AssetBag } from "../../assets";
import type { AreaDef, SceneLayout } from "../../areas";
import { C, VIEW } from "../../config";
import { clamp, randRange } from "../../utils";
import { winterWaterAt } from "../../world";
import { drawDepthRamp } from "./dither";
import { drawGrassTuft } from "./grass";
import { drawFloatingLog } from "./logs";
import {
  drawBucket,
  drawReedClump,
  drawShoreStone,
  drawSnowDrift,
} from "./props";
import type { SceneRenderer } from "./types";
import { WaterSurface } from "./water";

type BankPoint = readonly [number, number];

/**
 * Waterlines as (x, y) control points, smoothed in between: the river runs
 * between `FAR_BANK` (top) and `NEAR_BANK` (bottom). The far bank leaves the
 * frame through the top edge on the left, so the water continues upstream
 * instead of ending against a bank, and it drops away to the right, so the
 * reach bends out of sight downstream.
 */
const FAR_BANK: readonly BankPoint[] = [
  [0, -40],
  [40, -26],
  [80, -8],
  [110, 8],
  [140, 24],
  [180, 42],
  [230, 50],
  [300, 54],
  [360, 60],
  [420, 72],
  [480, 92],
];

const NEAR_BANK: readonly BankPoint[] = [
  [0, 158],
  [30, 170],
  [60, 184],
  [96, 202],
  [130, 211],
  [170, 219],
  [220, 228],
  [280, 237],
  [340, 244],
  [400, 250],
  [480, 268],
];

/** Y rows covered by the depth gradient; 1px rows keep the ramp banding-free. */
const WATER_TOP = 0;
/** The near bank reaches the bottom edge on the right, so the ramp runs low. */
const WATER_BOTTOM = VIEW.height - 2;

/**
 * Cold stone for the boulders in the current. They are read against teal water
 * and pale snow, so the body is blue-grey and never warm: a warm rock next to
 * snow reads as floating debris rather than as stone.
 */
const STONE = {
  dark: 0x35434b,
  mid: 0x51636c,
  light: 0x76888f,
  lit: 0x9db0b5,
} as const;

/**
 * Boulders standing in the current. The static pass paints them and the motion
 * pass needs their waterline, so the list lives in one place.
 */
const BOULDERS: readonly { x: number; y: number; size: number }[] = [
  { x: 118, y: 84, size: 8 },
  { x: 404, y: 104, size: 7 },
  { x: 392, y: 214, size: 6 },
];

interface Drift {
  /** Position across the channel: 0 is the far bank, 1 the near one. */
  offset: number;
  x: number;
  speed: number;
  rx: number;
  ry: number;
  /** Unit polygon of the ice slab, flattened for the water plane. */
  shape: number[];
}

interface Bubble {
  x: number;
  y: number;
  phase: number;
  speed: number;
}

interface Ripple {
  x: number;
  y: number;
  length: number;
  slope: number;
  alpha: number;
}

/**
 * One spruce on the banks.
 *
 * The river used to draw its firs in code: nested polygons, a lit wedge and a
 * shaded wedge per tier. They read well on their own, but next to the sprite
 * spruces of the lake and the bay they looked like a different artist's trees,
 * so every fir here is now a sprite from the same sheet. Only the scale, the
 * tint and the flip differ per row, which is what separates the far ranks from
 * the ones framing the bank.
 */
interface BankTree {
  x: number;
  base: number;
  height: number;
  tint: number;
  flip: boolean;
  /** Snow collar at the trunk; 0 keeps the back row cheap. */
  drift: number;
  /** True for the front row, whose silhouette is mirrored in the water. */
  reflect?: boolean;
}

/** Height of the drawn tree inside the 52×60 sprite, in sprite pixels. */
const TREE_BODY = 55;

/** Smoothstep between control points so the banks never kink. */
function bankAt(points: readonly BankPoint[], x: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (x <= b[0]) {
      const t = (x - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * (t * t * (3 - 2 * t));
    }
  }
  return last[1];
}

/** Deterministic 0..1 noise: the scene must look identical in previews. */
function noise(index: number, salt = 0): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * A quiet winter river: two snowy banks with an open channel between them, a
 * steady current carrying ice downstream, a fir line on the far bank and a
 * narrow upstream bend at the left edge. The angler stands on a spit of snow
 * on the near bank.
 */
export class RiverRenderer implements SceneRenderer {
  readonly layout: SceneLayout;
  private readonly area: AreaDef;
  private readonly assets: AssetBag;
  /** Waterline y for every screen column; drawing and hit tests share them. */
  private readonly farLine: Float32Array;
  private readonly nearLine: Float32Array;
  private readonly drifts: Drift[] = [];
  private readonly bubbles: Bubble[] = [];
  private readonly ripples: Ripple[] = [];
  /** Spruces on both banks, painted as sprites in `drawScenery`. */
  private readonly bankTrees: BankTree[] = [];
  /** The half-drowned trunk in mid-channel, rocked by the current. */
  private trunk: Container | null = null;
  private trunkBaseX = 0;
  private trunkBaseY = 0;
  /** Living surface: the current carries every crest downstream. */
  private readonly water: WaterSurface;

  constructor(assets: AssetBag, area: AreaDef) {
    this.assets = assets;
    this.area = area;
    this.layout = area.layout;

    this.farLine = new Float32Array(VIEW.width + 1);
    this.nearLine = new Float32Array(VIEW.width + 1);
    for (let x = 0; x <= VIEW.width; x += 1) {
      // The sines break the smooth control curve into an uneven bank, so the
      // edge never looks like a plotted graph.
      this.farLine[x] =
        bankAt(FAR_BANK, x) +
        Math.sin(x * 0.041 + 1.1) * 1.3 +
        Math.sin(x * 0.107 + 0.4) * 0.6;
      this.nearLine[x] =
        bankAt(NEAR_BANK, x) +
        Math.sin(x * 0.037 + 2.2) * 1.4 +
        Math.sin(x * 0.093 + 5.1) * 0.5;
    }

    this.buildTrees();
    this.buildWaterMarks();

    this.water = new WaterSurface({
      palette: this.palette,
      isWater: (x, y) => this.isWater(x, y),
      // The reach runs to the right and drops away downhill, so the drift is
      // quick and everything travels the same way.
      flow: 17,
      energy: 0.55,
      chops: 46,
      sheens: 5,
      pops: 4,
    });
  }

  private get palette() {
    return this.area.palette;
  }

  private farAt(x: number): number {
    return this.farLine[Math.round(clamp(x, 0, VIEW.width))];
  }

  private nearAt(x: number): number {
    return this.nearLine[Math.round(clamp(x, 0, VIEW.width))];
  }

  /** Downhill slope of the channel centreline; the current follows it. */
  private flowSlope(x: number, dx = 8): number {
    const from = Math.round(clamp(x, 0, VIEW.width));
    const to = Math.round(clamp(x + dx, 0, VIEW.width));
    const a = (this.farLine[from] + this.nearLine[from]) / 2;
    const b = (this.farLine[to] + this.nearLine[to]) / 2;
    return (b - a) / Math.max(1, to - from);
  }

  // ------------------------------------------------------------ construction

  /**
   * Two spruce rows on the far bank, three big firs crowning the reach and the
   * pair that frames the near corner.
   *
   * Every fir is drawn at the size the lake and the bay use. The far bank used
   * to be shrunk by distance — the back rank was less than half the height of
   * the trees in the near corner — which read as a different zoom level on the
   * same frame. Distance is carried by the tint (aerial perspective) and by the
   * z-order, never by the scale.
   */
  private buildTrees(): void {
    let x = -8;
    let index = 0;
    while (x < VIEW.width + 10) {
      const height = 52 + noise(index, 1) * 16;
      // Set back from the waterline, so the back row reads as a second rank of
      // forest instead of being buried behind the front row.
      const base = this.farAt(x) - 22 - noise(index, 2) * 16;
      if (base > 16) {
        this.bankTrees.push({
          x,
          base,
          height,
          tint: 0x74897f,
          flip: noise(index, 8) > 0.5,
          drift: 0,
        });
      }
      x += 24 + noise(index, 3) * 14;
      index += 1;
    }

    x = 2;
    index = 0;
    while (x < VIEW.width + 8) {
      if (noise(index, 4) < 0.08) {
        x += 26 + noise(index, 5) * 16;
        index += 1;
        continue;
      }
      const height = 56 + noise(index, 6) * 16;
      // A strip of snow between the trunk and the ice rim, so no fir is
      // planted right on the edge of the water.
      const base = this.farAt(x) - 11 - noise(index, 9) * 5;
      // Where the bank has already left the frame there is no shore to plant.
      if (base > 4) {
        this.bankTrees.push({
          x,
          base,
          height,
          tint: 0x94ab9f,
          flip: noise(index, 12) > 0.5,
          drift: height / TREE_BODY,
          reflect: true,
        });
      }
      x += 26 + noise(index, 7) * 16;
      index += 1;
    }

    // Three large firs crown the reach where the far bank is still in frame.
    for (const tree of [
      { x: 462, back: 20, height: 70 },
      { x: 478, back: 30, height: 76 },
      { x: 236, back: 14, height: 60 },
    ]) {
      this.bankTrees.push({
        x: tree.x,
        base: this.farAt(tree.x) - tree.back,
        height: tree.height,
        tint: 0x9db4a8,
        flip: tree.x > 400,
        drift: tree.height / TREE_BODY,
      });
    }

    // The pair framing the near corner. They are the closest trees in the
    // frame, so they keep the full colour of the sprite.
    for (const tree of [
      { x: 10, drop: 58, height: 82, tint: 0xc9dbd1 },
      { x: 38, drop: 76, height: 66, tint: 0xb9cec4 },
    ]) {
      this.bankTrees.push({
        x: tree.x,
        base: this.nearAt(tree.x) + tree.drop,
        height: tree.height,
        tint: tree.tint,
        flip: tree.x > 24,
        drift: tree.height / TREE_BODY,
      });
    }
  }

  private buildWaterMarks(): void {
    for (let i = 0; i < 8; i += 1) {
      const shape: number[] = [];
      for (let k = 0; k < 9; k += 1) {
        const angle = (k / 9) * Math.PI * 2;
        const radius = 0.74 + noise(k + i * 17, 8) * 0.36;
        shape.push(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.4);
      }
      this.drifts.push({
        offset: randRange(0.3, 0.7),
        x: randRange(0, 540),
        speed: randRange(7, 16),
        rx: randRange(6, 14),
        ry: randRange(2.4, 4.6),
        shape,
      });
    }

    for (let i = 0; i < 7; i += 1) {
      const x = randRange(70, 450);
      this.bubbles.push({
        x,
        // Keep the rings out of the band hidden by the HUD.
        y: Math.max(56, this.farAt(x) + randRange(16, 58)),
        phase: randRange(0, Math.PI * 2),
        speed: randRange(0.5, 1.3),
      });
    }

    for (let i = 0; i < 64; i += 1) {
      const x = randRange(8, VIEW.width - 8);
      const top = this.farAt(x);
      const y = top + (this.nearAt(x) - top) * randRange(0.14, 0.86);
      this.ripples.push({
        x,
        y,
        length: randRange(5, 22),
        slope: randRange(-0.5, 0.5),
        alpha: randRange(0.04, 0.13),
      });
    }
  }

  // ------------------------------------------------------------------ world

  drawWorld(g: Graphics): void {
    // Cold, dark bank soil under everything; snow and water cover it.
    g.rect(0, 0, VIEW.width, VIEW.height).fill(this.palette.farShore);

    // The water goes in first: it is a full-frame depth ramp, and both banks
    // are painted over it, so the ramp needs no per-row clipping and its bands
    // can be dithered. They used to be one-pixel rows, which banded into
    // visible horizontal stripes down the channel.
    this.drawWater(g);
    this.drawFarBank(g);
    this.drawWaterDetails(g);
    this.drawNearBank(g);
    this.drawBankLips(g);
  }

  private drawFarBank(g: Graphics): void {
    const shade: number[] = [0, 0];
    for (let x = 0; x <= VIEW.width; x += 2) shade.push(x, this.farLine[x] + 4);
    shade.push(VIEW.width, 0);
    g.poly(shade).fill(this.palette.snowShade);

    const snow: number[] = [0, 0];
    for (let x = 0; x <= VIEW.width; x += 2) snow.push(x, this.farLine[x] - 3);
    snow.push(VIEW.width, 0);
    g.poly(snow).fill(this.palette.snow);

    // Drifts on the upper bank, so the snowfield has some relief.
    for (let i = 0; i < 7; i += 1) {
      const x = 20 + i * 68 + noise(i, 11) * 22;
      const y = 8 + noise(i, 12) * 22;
      g.ellipse(x, y, 20 + noise(i, 13) * 14, 4).fill({
        color: this.palette.snowShade,
        alpha: 0.5,
      });
      g.ellipse(x + 2, y - 1.5, 15 + noise(i, 14) * 10, 2.6).fill({
        color: this.palette.snowLight,
        alpha: 0.7,
      });
    }

    // Snow that slid over the edge since the last thaw. It stays clear of the
    // waterline: the drifts used to hang over the ice rim and float on water.
    for (let x = 4; x < VIEW.width; x += 15) {
      const y = this.farLine[x] - 5;
      g.ellipse(x, y, 5 + ((x * 3) % 6), 1.3).fill({
        color: this.palette.snowLight,
        alpha: 0.7,
      });
      g.ellipse(x + 5, y - 2, 4, 1).fill({
        color: this.palette.snowShade,
        alpha: 0.4,
      });
    }

    // The spruces themselves are sprites, added to the sorted prop layer in
    // `drawScenery`: a Graphics cannot hold a texture, and the props layer
    // already sorts by the y of the base exactly like the two ranks used to.
  }

  private drawWater(g: Graphics): void {
    // The far bank is the dark end of the ramp, the near bank the light one.
    drawDepthRamp(g, {
      axis: "y",
      from: WATER_TOP,
      to: WATER_BOTTOM + 2,
      reverse: true,
      stops: this.palette.waterStops,
    });
  }

  private drawWaterDetails(g: Graphics): void {
    // Sky sheen down the channel. It used to be three continuous bands built
    // from nested rectangles, which read as painted guide lines running the
    // width of the river. The highlight is now a scatter of short glints along
    // the same mid-channel curve: it still tells the eye where the open water
    // is, but it breaks up and never forms a stripe.
    for (const [at, alpha] of [
      [0.38, 0.05],
      [0.55, 0.042],
      [0.72, 0.032],
    ] as const) {
      let x = 2;
      let index = 0;
      while (x < VIEW.width - 2) {
        const seed = noise(index, Math.round(at * 100));
        // The gaps are what stop the glints from lining up into a band.
        if (seed < 0.42) {
          x += 4 + seed * 30;
          index += 1;
          continue;
        }
        const length = 3 + noise(index, 41) * 9;
        const top = this.farAt(x);
        const bottom = this.nearAt(x);
        const mid =
          top + (bottom - top) * (at + (noise(index, 42) - 0.5) * 0.06);
        this.rect(g, x, mid, length, 1, 0xa8e4e4, alpha);
        this.rect(
          g,
          x + length * 0.3,
          mid + 1,
          length * 0.55,
          1,
          0xbfeef0,
          alpha * 0.55,
        );
        x += length + 3 + noise(index, 43) * 13;
        index += 1;
      }
    }

    // Contact shade and a bright rim along both banks: the depth gradient
    // alone gives no sense of an embankment.
    this.traceEdge(g, (x) => this.farLine[x] + 1);
    g.stroke({ width: 3, color: this.palette.waterFar, alpha: 0.34 });
    this.traceEdge(g, (x) => this.farLine[x] + 13);
    g.stroke({ width: 10, color: this.palette.treeDark, alpha: 0.14 });
    this.traceEdge(g, (x) => this.farLine[x] + 4);
    g.stroke({ width: 2, color: this.palette.ice, alpha: 0.1 });

    this.traceEdge(g, (x) => this.nearLine[x] - 1);
    g.stroke({ width: 4, color: 0x08222f, alpha: 0.3 });
    this.traceEdge(g, (x) => this.nearLine[x] - 5);
    g.stroke({ width: 3, color: this.palette.ice, alpha: 0.1 });

    // A broken reflection of the fir line in the far water.
    for (const pine of this.bankTrees) {
      if (!pine.reflect) continue;
      if (pine.x % 34 > 16) continue;
      this.rect(
        g,
        pine.x - 1,
        this.farAt(pine.x) + 2,
        2,
        8 + (Math.round(pine.height) % 12),
        this.palette.treeDark,
        0.13,
      );
    }

    // Cold mist over the upstream water: the reach leaves the frame in haze
    // instead of ending in a flat dark corner.
    for (const [x, y, rx, alpha] of [
      [64, 34, 96, 0.05],
      [150, 48, 74, 0.04],
      [26, 68, 62, 0.035],
    ] as const) {
      g.ellipse(x, y, rx, rx * 0.15).fill({ color: 0xdff2f6, alpha });
    }

    // Sleeping ripples that belong to the water, not to the frame.
    for (const ripple of this.ripples) {
      g.moveTo(ripple.x, ripple.y);
      g.quadraticCurveTo(
        ripple.x + ripple.length * 0.5,
        ripple.y - 1.4,
        ripple.x + ripple.length,
        ripple.y + ripple.slope,
      );
      g.stroke({
        width: 1,
        color: ripple.alpha > 0.09 ? this.palette.snowLight : this.palette.ice,
        alpha: ripple.alpha,
      });
    }

    // Current crests: short, brighter wavelets that show which way the river
    // runs even while the frame is still.
    for (let i = 0; i < 14; i += 1) {
      const x = 30 + i * 31 + noise(i, 31) * 10;
      const top = this.farAt(x);
      const y = top + (this.nearAt(x) - top) * (0.38 + noise(i, 32) * 0.26);
      const width = 5 + noise(i, 33) * 7;
      const slope = this.flowSlope(x, width);
      g.moveTo(x - width, y)
        .quadraticCurveTo(x, y - 2.4, x + width, y + slope * width)
        .stroke({
          width: 1,
          color: this.palette.snowLight,
          alpha: 0.16 + noise(i, 34) * 0.1,
        });
    }

    // A ripple line that trails the current flowing in from upstream.
    for (let i = 0; i < 9; i += 1) {
      const x = 24 + i * 18;
      const y = 116 - i * 5 + Math.sin(i * 1.7) * 5;
      g.moveTo(x - 5, y)
        .quadraticCurveTo(x, y - 3, x + 6, y)
        .stroke({ width: 1, color: this.palette.snowLight, alpha: 0.22 });
    }

    // The half-drowned gravel bars that used to sit mid-channel were grey
    // ellipse smudges with a lighter core: at a glance they read as floating
    // rubbish rather than as river bed, so they are gone. The current crests,
    // ripples and boulders carry the water on their own.

    // The trunk is not painted here: it gets its own layer between the water
    // and the surface motion (see `drawFloating`), because the current rolls it
    // and a painted log would be frozen into the river bed.
    for (const rock of BOULDERS) {
      this.drawBoulder(g, rock.x, rock.y, rock.size);
    }
  }

  /**
   * The half-drowned trunk, in a container the current can rock.
   *
   * It sits in the open reach downstream of the cast, clear of the boulders and
   * of the bobber band, so it never reads as an obstacle the player should aim
   * around. Most of its body is above the waterline and a little snow lies on
   * it: at 58 it was a thin dark stick half a frame away, drowned deep enough
   * that only the bark ridge showed — driftwood the eye could not identify.
   */
  drawFloating(layer: Container): void {
    const length = 46;
    const x = 352;
    const y = (this.farAt(x) + this.nearAt(x)) / 2;
    // Along the current: the trunk lies the way the river carries it.
    const angle = Math.atan2(
      this.nearAt(x + length / 2) - this.nearAt(x - length / 2),
      length,
    );
    // Water colour at the trunk's own depth, so the submerged wash matches the
    // ramp painted underneath it instead of sitting on it as a grey film.
    const depth = clamp((y - WATER_TOP) / (WATER_BOTTOM + 2 - WATER_TOP));

    const node = new Container();
    node.position.set(x, y);
    const g = new Graphics();
    drawFloatingLog(
      g,
      {
        x: 0,
        y: 0,
        length,
        angle,
        rootRadius: 3.7,
        tipRadius: 2.8,
        submerged: 0.42,
        water: winterWaterAt(1 - depth, this.palette.waterStops),
        snow: 0.35,
        seed: 5,
      },
      this.palette,
    );
    node.addChild(g);
    layer.addChild(node);

    this.trunk = node;
    this.trunkBaseX = x;
    this.trunkBaseY = y;
  }

  /**
   * A boulder standing in the current.
   *
   * The old version was three stacked ellipses in a warm grey, which read as a
   * floating mushroom rather than as stone. This one is built the way the rest
   * of the scene is lit: an irregular faceted outline with a lit top face, a
   * shaded side, a snow ridge along the cap, a dark waterline where the river
   * cuts across it and a wake trailing downstream.
   */
  private drawBoulder(g: Graphics, x: number, y: number, size: number): void {
    const w = size * 1.45;
    const h = size * 1.15;
    const water = y + h * 0.34;

    // Shadow on the bed and the slush collar the current pushes around it.
    g.ellipse(x + w * 0.12, water + h * 0.34, w * 1.24, h * 0.3).fill({
      color: this.palette.waterFar,
      alpha: 0.42,
    });
    g.ellipse(x, water + h * 0.04, w * 1.12, h * 0.18).fill({
      color: this.palette.ice,
      alpha: 0.38,
    });

    // Irregular stone outline: the apex sits left of centre and the shoulders
    // sit at different heights, so it never reads as a symmetric tent.
    const outline = [
      x - w * 0.34,
      y - h,
      x + w * 0.16,
      y - h * 0.9,
      x + w * 0.74,
      y - h * 0.42,
      x + w * 0.98,
      y + h * 0.02,
      x + w * 0.52,
      water + h * 0.16,
      x - w * 0.68,
      water + h * 0.2,
      x - w * 0.96,
      y + h * 0.06,
      x - w * 0.7,
      y - h * 0.44,
    ];
    g.poly(outline).fill(STONE.mid);
    g.poly(outline).stroke({ width: 1, color: STONE.dark, alpha: 0.5 });

    // Lit top face, tilted away from the light on the upper left. It uses the
    // brightest tone of the ramp, otherwise the cap and the body merge.
    g.poly([
      x - w * 0.34,
      y - h,
      x + w * 0.16,
      y - h * 0.9,
      x + w * 0.5,
      y - h * 0.34,
      x - w * 0.06,
      y - h * 0.2,
      x - w * 0.62,
      y - h * 0.42,
    ]).fill(STONE.lit);

    // Shaded right side under the lit face.
    g.poly([
      x + w * 0.16,
      y - h * 0.9,
      x + w * 0.74,
      y - h * 0.42,
      x + w * 0.98,
      y + h * 0.02,
      x + w * 0.52,
      water + h * 0.16,
      x + w * 0.18,
      y - h * 0.16,
      x + w * 0.5,
      y - h * 0.34,
    ]).fill(STONE.dark);

    // Snow lying along the ridge, thicker on the windward (left) side.
    this.rect(
      g,
      x - w * 0.44,
      y - h - 1,
      w * 0.38,
      2,
      this.palette.snowLight,
      0.95,
    );
    this.rect(
      g,
      x - w * 0.06,
      y - h * 0.94,
      w * 0.26,
      1,
      this.palette.snowLight,
      0.85,
    );
    this.rect(
      g,
      x - w * 0.66,
      y - h * 0.6,
      w * 0.2,
      1,
      this.palette.snowLight,
      0.7,
    );
    this.rect(g, x - w * 0.24, y - h * 0.99, 2, 1, this.palette.snow, 0.8);

    // Wet stone below the waterline, then the waterline itself.
    g.poly([
      x - w * 0.7,
      water,
      x + w * 0.6,
      water - h * 0.06,
      x + w * 0.52,
      water + h * 0.16,
      x - w * 0.68,
      water + h * 0.2,
    ]).fill({ color: this.palette.waterFar, alpha: 0.4 });
    g.moveTo(x - w * 0.72, water)
      .lineTo(x + w * 0.62, water - h * 0.06)
      .stroke({ width: 1, color: 0x0c2a3c, alpha: 0.5 });
    g.moveTo(x - w * 0.66, water + 1)
      .lineTo(x + w * 0.56, water - h * 0.06 + 1)
      .stroke({ width: 1, color: this.palette.ice, alpha: 0.45 });

    // Cracks in the stone: two short, angular lines.
    g.moveTo(x - w * 0.34, y - h * 0.46)
      .lineTo(x - w * 0.1, y - h * 0.28)
      .lineTo(x - w * 0.16, water - 1)
      .stroke({ width: 1, color: STONE.dark, alpha: 0.45 });
    g.moveTo(x + w * 0.2, y - h * 0.52)
      .lineTo(x + w * 0.34, y - h * 0.3)
      .stroke({ width: 1, color: STONE.dark, alpha: 0.35 });

    // Water torn by the upstream face, and a wake trailing downstream.
    g.moveTo(x - w * 1.0, water + h * 0.12)
      .lineTo(x - w * 0.7, water + h * 0.06)
      .stroke({ width: 1, color: this.palette.snowLight, alpha: 0.32 });
    for (let i = 0; i < 3; i += 1) {
      const wakeX = x + w * 0.96 + i * (w * 0.3 + 2);
      const wakeY = water + h * 0.02 + i * h * 0.16;
      g.moveTo(wakeX, wakeY)
        .lineTo(wakeX + w * 0.46 + i * 3, wakeY + h * 0.12)
        .stroke({
          width: 1,
          color: this.palette.snowLight,
          alpha: 0.2 - i * 0.05,
        });
    }
  }

  private drawNearBank(g: Graphics): void {
    const shade: number[] = [0, VIEW.height];
    for (let x = 0; x <= VIEW.width; x += 2) {
      shade.push(x, this.nearLine[x] + 1);
    }
    shade.push(VIEW.width, VIEW.height);
    g.poly(shade).fill(this.palette.snowShade);

    const snow: number[] = [0, VIEW.height];
    for (let x = 0; x <= VIEW.width; x += 2) {
      snow.push(x, this.nearLine[x] + 8);
    }
    snow.push(VIEW.width, VIEW.height);
    g.poly(snow).fill(this.palette.snow);

    // Wind drifts across the bank.
    for (let i = 0; i < 14; i += 1) {
      const x = 12 + i * 34 + ((i * 13) % 17);
      const y = this.nearAt(x) + 14 + ((i * 11) % 22);
      if (y > VIEW.height - 4) continue;
      g.ellipse(x, y, 13 + (i % 4) * 5, 3.2).fill({
        color: this.palette.snowShade,
        alpha: 0.45,
      });
      g.ellipse(x + 1, y - 1, 9 + (i % 3) * 4, 2.2).fill({
        color: this.palette.snowLight,
        alpha: 0.6,
      });
    }

    // A trail of boot prints leading to the angler's spit.
    for (let i = 0; i < 9; i += 1) {
      const t = i / 8;
      const side = i % 2 === 0 ? -2.5 : 2.5;
      g.ellipse(34 + t * 56 + side, 264 - t * 56, 2.2, 1.2).fill({
        color: 0x8fa8ba,
        alpha: 0.5,
      });
    }

    // Ice floes that have grounded on the shallow bank.
    for (const [x, width] of [
      [148, 12],
      [232, 8],
      [322, 10],
      [452, 7],
    ] as const) {
      const y = this.nearAt(x) + 10;
      g.ellipse(x, y, width, width * 0.24).fill({
        color: this.palette.ice,
        alpha: 0.55,
      });
      g.ellipse(x - 1, y - 1, width * 0.6, width * 0.14).fill({
        color: this.palette.snowLight,
        alpha: 0.75,
      });
    }

    // Sparkles so the snow does not read as flat paper.
    for (let i = 0; i < 40; i += 1) {
      const x = 4 + ((i * 47) % (VIEW.width - 8));
      const y = this.nearAt(x) + 4 + ((i * 29) % 30);
      if (y > VIEW.height - 2 || (x + y) % 3 !== 0) continue;
      this.rect(g, x, y, 1, 1, this.palette.snowLight, 0.9);
    }
  }

  private drawBankLips(g: Graphics): void {
    // Eroded soil under the far snow, then the ice pushed out of the bank.
    this.traceEdge(g, (x) => this.farLine[x] + 2);
    g.stroke({ width: 2, color: 0x1c3238, alpha: 0.5 });
    this.traceEdge(g, (x) => this.farLine[x] - 1);
    g.stroke({ width: 3, color: this.palette.ice, alpha: 0.95 });
    this.traceEdge(g, (x) => this.farLine[x] - 2);
    g.stroke({ width: 1, color: this.palette.snowLight, alpha: 0.8 });
    this.traceEdge(g, (x) => this.farLine[x] + 1);
    g.stroke({ width: 1, color: this.palette.iceDeep, alpha: 0.6 });

    // Icicles hanging off the far ledge.
    for (let x = 12; x < VIEW.width; x += 41) {
      const y = this.farLine[x] + 1;
      const length = 2 + Math.round(noise(x, 21) * 4);
      this.rect(g, x, y, 1, length, this.palette.ice, 0.75);
      this.rect(
        g,
        x + 1,
        y,
        1,
        Math.max(1, length - 2),
        this.palette.snowLight,
        0.5,
      );
    }

    // Near shelf: a narrow ice ledge with a wet dark seam.
    this.traceEdge(g, (x) => this.nearLine[x] - 1);
    g.stroke({ width: 1, color: 0x0c2a3c, alpha: 0.45 });
    this.traceEdge(g, (x) => this.nearLine[x] + 1);
    g.stroke({ width: 3, color: this.palette.ice, alpha: 0.85 });
    this.traceEdge(g, (x) => this.nearLine[x] - 1);
    g.stroke({ width: 1, color: this.palette.snowLight, alpha: 0.55 });
    this.traceEdge(g, (x) => this.nearLine[x] + 3);
    g.stroke({ width: 1, color: this.palette.iceDeep, alpha: 0.6 });

    // Cracks and slush in the ledge.
    for (let x = 8; x < VIEW.width; x += 23) {
      const y = this.nearLine[x];
      g.moveTo(x - 4, y + 2)
        .lineTo(x + 2, y + 4)
        .lineTo(x + 5, y + 7)
        .stroke({ width: 1, color: this.palette.snow, alpha: 0.45 });
    }
    for (let x = 20; x < VIEW.width; x += 37) {
      g.ellipse(x, this.nearLine[x], 5 + (x % 4), 1.2).fill({
        color: this.palette.snow,
        alpha: 0.32,
      });
    }
  }

  // ---------------------------------------------------------------- scenery

  drawScenery(props: Container): void {
    this.drawTrees(props);
    this.drawFarProps(props);
    this.drawNearProps(props);
    this.drawAnglerCape(props);
    this.drawLantern(props);
  }

  private addMound(
    props: Container,
    x: number,
    y: number,
    scale: number,
  ): void {
    drawSnowDrift(props, x, y, scale, this.palette);
  }

  /**
   * Every spruce on both banks, as sprites from the shared sheet.
   *
   * They are added to the prop layer rather than painted into the world
   * Graphics: a Graphics cannot hold a texture, and `props` is sorted by the y
   * of each base, which is exactly how the two drawn ranks used to be ordered.
   * The tint does the aerial perspective — the back rank is nearly a silhouette,
   * the near corner keeps the full colour of the sprite.
   */
  private drawTrees(props: Container): void {
    const trees = this.assets.trees;
    if (trees.length === 0) return;
    this.bankTrees.forEach((tree, index) => {
      const texture = trees[index % trees.length];
      const scale = tree.height / TREE_BODY;
      if (tree.drift > 0) {
        this.addMound(props, tree.x, tree.base, tree.drift * 0.9);
      }
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(tree.x, tree.base);
      sprite.scale.set(tree.flip ? -scale : scale, scale);
      sprite.tint = tree.tint;
      sprite.zIndex = tree.base;
      props.addChild(sprite);
    });
  }

  private drawFarProps(props: Container): void {
    for (const [x, scale] of [
      [196, 0.72],
      [268, 0.56],
      [356, 0.64],
    ] as const) {
      // The mound is pushed up the bank: centred on the waterline it spilled
      // over the ice rim and read as snow floating on the river.
      const y = this.farAt(x) - 5;
      this.addMound(props, x, y, scale * 0.5);
      const bush = new Sprite(this.assets.bushes[0] ?? this.assets.trees[1]);
      bush.anchor.set(0.5, 1);
      bush.position.set(x, y);
      bush.scale.set(scale);
      bush.tint = 0x7d9a92;
      bush.zIndex = y;
      props.addChild(bush);
    }
  }

  private drawNearProps(props: Container): void {
    // Reeds and dry grass at the water's edge.
    for (const [x, seed] of [
      [150, 1],
      [214, 2],
      [352, 3],
      [438, 4],
    ] as const) {
      drawReedClump(props, x, this.nearAt(x) + 1, this.palette, 1, seed);
    }
    for (const [x, flip] of [
      [72, 1],
      [128, -1],
      [200, 1],
      [318, -1],
      [398, 1],
      [466, -1],
    ] as const) {
      drawGrassTuft(props, x, this.nearAt(x) + 14, 0x8f7a58, flip, 1.05);
    }

    // Boulders and driftwood on the bank.
    for (const [x, scale] of [
      [250, 1.05],
      [412, 0.85],
    ] as const) {
      const y = this.nearAt(x) + 12;
      this.addMound(props, x, y, scale * 0.55);
      drawShoreStone(props, x, y - 1, scale * 0.9, this.palette);
    }
    this.drawDriftwood(props, 246, this.nearAt(246) + 20);
    this.drawDriftwood(props, 360, this.nearAt(360) + 30);

    // A signpost and the angler's bucket.
    const sign = new Sprite(this.assets.sign);
    sign.anchor.set(0.5, 1);
    sign.position.set(176, this.nearAt(176) + 12);
    sign.rotation = -0.08;
    sign.scale.set(1.1);
    sign.zIndex = this.nearAt(176) + 12;
    props.addChild(sign);

    drawBucket(props, 124, 214);
  }

  private drawDriftwood(props: Container, x: number, y: number): void {
    // The same trunk drawing as the water, only dry: it lies on the snow, so it
    // takes the snow shading and a contact shadow instead of a waterline.
    const g = new Graphics();
    drawFloatingLog(
      g,
      {
        x,
        y,
        length: 38,
        angle: 0.08,
        rootRadius: 3.4,
        tipRadius: 2.6,
        submerged: 0,
        snow: 0.95,
        seed: Math.round(x),
      },
      this.palette,
    );
    g.zIndex = y;
    props.addChild(g);
  }

  /**
   * The angler's snow spit: a shallow point that follows the near waterline and
   * bulges upstream under his feet, so he never looks like he stands in water.
   */
  private drawAnglerCape(props: Container): void {
    const { x: anglerX, y: anglerY } = this.layout.angler;
    const from = Math.round(anglerX - 34);
    const to = Math.round(anglerX + 38);
    const bulge = (x: number): number => {
      const t = (x - anglerX) / 34;
      return Math.max(0, 1 - t * t) * 13;
    };

    const points: number[] = [];
    for (let x = from; x <= to; x += 2) points.push(x, this.nearAt(x) + 5);
    for (let x = to; x >= from; x -= 2) {
      points.push(x, this.nearAt(x) - bulge(x));
    }
    const g = new Graphics();
    g.poly(points).fill(this.palette.snowShade);
    const inner: number[] = [];
    for (let x = from + 3; x <= to - 3; x += 2) {
      inner.push(x, this.nearAt(x) + 4);
    }
    for (let x = to - 3; x >= from + 3; x -= 2) {
      inner.push(x, this.nearAt(x) - bulge(x) + 3);
    }
    g.poly(inner).fill(this.palette.snow);
    // Wet ice along the upstream edge of the point.
    g.moveTo(from + 4, this.nearAt(from + 4) - bulge(from + 4) + 2);
    for (let x = from + 6; x <= to - 4; x += 2) {
      g.lineTo(x, this.nearAt(x) - bulge(x) + 2);
    }
    g.stroke({ width: 2, color: this.palette.ice, alpha: 0.7 });
    g.zIndex = anglerY - 0.6;
    props.addChild(g);

    // A couple of stones and a reed tuft on the point.
    const stones = new Graphics();
    stones.ellipse(anglerX + 26, this.nearAt(anglerX + 26) + 1, 4, 1.6).fill({
      color: 0x64767d,
      alpha: 0.9,
    });
    stones.ellipse(anglerX - 24, this.nearAt(anglerX - 24) + 2, 5, 1.8).fill({
      color: this.palette.snowLight,
      alpha: 0.8,
    });
    stones.zIndex = anglerY - 0.5;
    props.addChild(stones);
  }

  private drawLantern(props: Container): void {
    const light = this.layout.light;
    if (!light) return;
    const x = light.x;
    const y = light.y;
    const g = new Graphics();
    g.ellipse(x - 1, y + 1, 7, 2.6).fill({
      color: this.palette.snowShade,
      alpha: 0.9,
    });
    g.rect(x - 1, y - 12, 2, 12).fill(C.brownDark);
    g.rect(x - 1, y - 12, 1, 12).fill(C.brownLight);
    g.rect(x - 4, y - 13, 8, 2).fill(C.ink);
    g.rect(x - 3, y - 14, 6, 1).fill(this.palette.snow);
    g.rect(x - 3, y - 12, 6, 6).fill({ color: C.ink, alpha: 0.92 });
    g.rect(x - 2, y - 11, 4, 4).fill({ color: 0x34321f, alpha: 0.95 });
    g.rect(x - 3, y - 6, 6, 1).fill(C.brownDark);
    g.zIndex = y;
    props.addChild(g);
  }

  // ----------------------------------------------------------------- motion

  drawMotion(g: Graphics, time: number, cloudiness = 0): void {
    g.clear();

    // Surface motion sits under the ice slabs, so a floe still reads as solid
    // and the crests break against its edge instead of running across it.
    this.water.draw(g, time, cloudiness);

    // Floating ice slabs carried downstream along the current.
    for (const drift of this.drifts) {
      const x = ((drift.x + time * drift.speed + 60) % (VIEW.width + 80)) - 40;
      if (x < -20 || x > VIEW.width + 20) continue;
      const top = this.farAt(x);
      const bottom = this.nearAt(x);
      if (bottom - top < drift.rx * 2.4) continue;
      const y = top + (bottom - top) * drift.offset;
      const edge = Math.min(x + 20, VIEW.width + 20 - x) / 26;
      const alpha = clamp(edge);
      if (alpha <= 0.05) continue;
      const points: number[] = [];
      for (let i = 0; i < drift.shape.length; i += 2) {
        points.push(
          x + drift.shape[i] * drift.rx,
          y + drift.shape[i + 1] * drift.ry,
        );
      }
      g.poly(points).fill({ color: this.palette.ice, alpha: 0.72 * alpha });
      // Top face catches the light; the upstream edge stays bright.
      const cap: number[] = [];
      for (let i = 0; i < points.length; i += 2) {
        cap.push(
          x + (points[i] - x) * 0.66,
          y + (points[i + 1] - y) * 0.66 - drift.ry * 0.12,
        );
      }
      g.poly(cap).fill({ color: this.palette.snowLight, alpha: 0.8 * alpha });
      g.poly(points).stroke({
        width: 1,
        color: this.palette.snow,
        alpha: 0.5 * alpha,
      });
      g.moveTo(x - drift.rx * 0.4, y - drift.ry * 0.1)
        .lineTo(x + drift.rx * 0.15, y + drift.ry * 0.2)
        .stroke({ width: 1, color: this.palette.iceDeep, alpha: 0.6 * alpha });
      // Slush trail behind the slab.
      this.rect(
        g,
        x - drift.rx - 4,
        y + 0.5,
        drift.rx * 0.8,
        1,
        this.palette.snowLight,
        0.2 * alpha,
      );
    }

    // Rises: fish and air come up mid-channel.
    for (const bubble of this.bubbles) {
      const pulse = (Math.sin(time * bubble.speed + bubble.phase) + 1) / 2;
      const radius = 2.5 + pulse * 5;
      g.ellipse(bubble.x, bubble.y, radius, radius * 0.34).stroke({
        width: 1,
        color: this.palette.ice,
        alpha: 0.3 - pulse * 0.24,
      });
      if (pulse > 0.88) {
        this.rect(g, bubble.x - 1, bubble.y - 1, 1, 1, this.palette.snow, 0.45);
      }
    }

    // Foam breathing along both waterlines.
    for (let x = 6; x < VIEW.width; x += 13) {
      const pulse = (Math.sin(time * 1.6 + x * 0.16) + 1) / 2;
      const y = this.nearLine[x] - 1;
      g.moveTo(x, y)
        .lineTo(x + 5 + pulse * 4, y - 1.5)
        .stroke({
          width: 1,
          color: this.palette.snowLight,
          alpha: 0.12 + pulse * 0.14,
        });
    }
    for (let x = 10; x < VIEW.width; x += 19) {
      const pulse = (Math.sin(time * 1.3 + x * 0.11 + 1.7) + 1) / 2;
      const y = this.farLine[x] + 2;
      g.moveTo(x, y)
        .lineTo(x + 4 + pulse * 4, y + 1)
        .stroke({
          width: 1,
          color: this.palette.ice,
          alpha: 0.1 + pulse * 0.12,
        });
    }

    // Water piling against the boulders. It used to be a pair of arcs orbiting
    // the upstream stone, which swept across its face once per revolution and
    // read as a drawn ring rather than as current. Each boulder now carries two
    // still arcs at its own waterline that only breathe, so the water works
    // against the stone instead of circling it.
    for (const rock of BOULDERS) {
      const height = rock.size * 1.15;
      const water = rock.y + height * 0.34;
      const pulse = (Math.sin(time * 1.3 + rock.x) + 1) / 2;
      for (let i = 0; i < 2; i += 1) {
        g.ellipse(
          rock.x,
          water + 1 + i,
          rock.size * (1.15 + i * 0.5),
          1.4 + i * 0.5,
        ).stroke({
          width: 1,
          color: this.palette.snow,
          alpha: (0.13 - i * 0.05) * (0.55 + pulse * 0.9),
        });
      }
    }
  }

  // ------------------------------------------------------------------ water

  /**
   * The current works the sunken trunk: it rolls on the swell and creeps a
   * little downstream, the way a log caught in the channel never quite sits
   * still. The drift stays under a pixel so the trunk keeps its place.
   */
  animate(time: number): void {
    const trunk = this.trunk;
    if (!trunk) return;
    trunk.y = this.trunkBaseY + Math.sin(time * 0.62) * 0.6;
    trunk.x = this.trunkBaseX + Math.sin(time * 0.21) * 0.7;
    trunk.rotation = Math.sin(time * 0.44 + 1.2) * 0.014;
  }

  isWater(x: number, y: number): boolean {
    if (x < 0 || x > VIEW.width || y < 0 || y > VIEW.height) return false;
    const column = Math.round(x);
    return y > this.farLine[column] && y < this.nearLine[column];
  }

  // ----------------------------------------------------------------- helpers

  /** Stroke the whole waterline from left to right with a 2px step. */
  private traceEdge(g: Graphics, edge: (x: number) => number): void {
    g.moveTo(0, edge(0));
    for (let x = 2; x <= VIEW.width; x += 2) g.lineTo(x, edge(x));
  }

  private rect(
    g: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    alpha = 1,
  ): void {
    g.rect(x, y, width, height).fill({ color, alpha });
  }
}
