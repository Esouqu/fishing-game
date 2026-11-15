import { Container, Graphics, Sprite } from "pixi.js";
import type { Texture } from "pixi.js";
import type { AssetBag } from "../../assets";
import type { AreaDef, SceneLayout } from "../../areas";
import { C, VIEW } from "../../config";
import { lerp, randRange } from "../../utils";
import { mixColor, winterWaterAt } from "../../world";
import { ditherNoise } from "./dither";
import { drawGrassTuft } from "./grass";
import { drawFloatingLog, type LogShape } from "./logs";
import { drawReedClump, drawShoreStone, drawSnowDrift } from "./props";
import type { SceneRenderer } from "./types";
import { WaterSurface } from "./water";

const CENTER = { x: 240, y: 132 };
const RADIUS = { x: 200, y: 118 };
const SHORE_POINTS = 128;
/**
 * The deep basin sits off-centre, toward the far right of the hole, and its
 * outline is far more ragged than the shoreline. Depth is never a bullseye.
 */
const DEEP = { x: 276, y: 140 };
const DEEP_RADIUS = { x: 46, y: 30 };
/**
 * Depth is painted as ~100 nested contours. That is far more than the shape
 * needs on purpose: neighbours then differ by a single colour unit, so the
 * ramp reads as smooth water instead of visible steps. The contours are drawn
 * as thin bands, not stacked discs, so the fill rate stays at one layer.
 */
const DEPTH_LAYERS = 96;

interface IceDisc {
  x: number;
  y: number;
  rx: number;
  ry: number;
  alpha: number;
}

interface Wisp {
  x: number;
  y: number;
  phase: number;
  speed: number;
  radius: number;
}

interface Bubble {
  x: number;
  y: number;
  speed: number;
  phase: number;
}

/** Dark forest lake: water almost all the way to the frame, a raft, reeds. */
export class PoolRenderer implements SceneRenderer {
  readonly layout: SceneLayout;
  private readonly area: AreaDef;
  private readonly assets: AssetBag;
  private readonly discs: IceDisc[] = [];
  private readonly logs: LogShape[] = [];
  /** Trunks in the water and the motion each one rides. */
  private readonly trunks: Array<{
    node: Container;
    baseX: number;
    baseY: number;
    phase: number;
    speed: number;
    roll: number;
  }> = [];
  private readonly wisps: Wisp[] = [];
  private readonly bubbles: Bubble[] = [];
  /** Living surface: the lake is calm, so it breathes rather than rolls. */
  private readonly water: WaterSurface;

  constructor(assets: AssetBag, area: AreaDef) {
    this.assets = assets;
    this.area = area;
    this.layout = area.layout;

    this.water = new WaterSurface({
      palette: this.palette,
      isWater: (x, y) => this.isWater(x, y),
      // A forest lake is nearly still: a slow drift and long, low crests.
      flow: 6,
      energy: 0.3,
      chops: 32,
      sheens: 6,
      pops: 7,
    });

    for (let i = 0; i < 9; i += 1) {
      const angle = randRange(0, Math.PI * 2);
      const r = randRange(0.25, 0.9);
      this.discs.push({
        x: CENTER.x + Math.cos(angle) * RADIUS.x * r,
        y: CENTER.y + Math.sin(angle) * RADIUS.y * r,
        rx: randRange(4, 12),
        ry: randRange(1.5, 4),
        alpha: randRange(0.18, 0.4),
      });
    }

    // Three drifting trunks, all lying within fifteen degrees of flat: that is
    // the angle a log actually floats at, and anything steeper reads as a pole
    // leaning into the lake. They sit in open water clear of the bank trees,
    // where the canopies would otherwise bury them.
    const water = mixColor(
      this.palette.waterStops[1].color,
      this.palette.waterStops[2].color,
      0.45,
    );
    this.logs.push(
      {
        x: 148,
        y: 92,
        angle: -0.1,
        length: 46,
        rootRadius: 5,
        tipRadius: 4,
        snow: 0.85,
        seed: 3,
        water,
      },
      {
        x: 338,
        y: 158,
        angle: 0.14,
        length: 40,
        rootRadius: 4.6,
        tipRadius: 3.7,
        snow: 0.5,
        seed: 11,
        water,
      },
      {
        x: 224,
        y: 62,
        angle: -0.04,
        length: 36,
        rootRadius: 4.3,
        tipRadius: 3.4,
        snow: 0.95,
        seed: 23,
        water,
      },
    );

    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2 + 0.5;
      this.wisps.push({
        x: CENTER.x + Math.cos(angle) * (RADIUS.x - 22),
        y: CENTER.y + Math.sin(angle) * (RADIUS.y - 18),
        phase: randRange(0, Math.PI * 2),
        speed: randRange(0.8, 1.6),
        radius: randRange(1.4, 2.6),
      });
    }

    for (let i = 0; i < 14; i += 1) {
      this.bubbles.push({
        x: randRange(CENTER.x - RADIUS.x + 30, CENTER.x + RADIUS.x - 30),
        y: randRange(CENTER.y - RADIUS.y + 30, CENTER.y + RADIUS.y - 30),
        speed: randRange(1.5, 4),
        phase: randRange(0, Math.PI * 2),
      });
    }
  }

  private get palette() {
    return this.area.palette;
  }

  // ------------------------------------------------------------------ world

  drawWorld(g: Graphics): void {
    // The clearing is deep snow: the lake is a hole cut into the snowfield,
    // so the bank matches the river and the bay at the water's edge and the
    // ground around the trees reads as snow instead of dark forest floor.
    g.rect(0, 0, VIEW.width, VIEW.height).fill(this.palette.snow);

    // Wind drifts across the field. They are drawn before the water, so the
    // ones that fall inside the hole are simply covered by it.
    for (let i = 0; i < 34; i += 1) {
      const x = 14 + ((i * 89) % (VIEW.width - 28));
      const y = 12 + ((i * 57) % (VIEW.height - 24));
      g.ellipse(x, y, 13 + (i % 4) * 7, 3.4).fill({
        color: this.palette.snowShade,
        alpha: 0.38,
      });
      g.ellipse(x + 2, y - 1, 8 + (i % 3) * 5, 2.2).fill({
        color: this.palette.snowLight,
        alpha: 0.5,
      });
    }
    for (let i = 0; i < 18; i += 1) {
      const x = 20 + ((i * 53) % (VIEW.width - 40));
      const y = 18 + ((i * 71) % (VIEW.height - 36));
      if ((x + y) % 5 !== 0) continue;
      g.rect(x, y, 1, 1).fill({
        color: this.palette.snowLight,
        alpha: 0.9,
      });
    }

    // Snow slides into the hole: a shaded shoulder, a bright lip and the ice
    // that has pushed out over the water. The rings follow the same noisy
    // outline as the water, so the bank never looks like a plotted ellipse.
    g.poly(this.shorePolygon(0.13)).fill({
      color: this.palette.snowShade,
      alpha: 0.75,
    });
    g.poly(this.shorePolygon(0.065)).fill(this.palette.snow);
    g.poly(this.shorePolygon(0.025)).fill(this.palette.snowLight);
    g.poly(this.shorePolygon(0.004)).fill(this.palette.iceDeep);

    // Depth contours: the shoreline blends into an off-centre basin, so the
    // dark water sits to one side and the shelf is wider on the other. Every
    // contour is dithered, so the one-unit step between neighbours scatters
    // into water grain instead of reading as a staircase.
    for (let i = 0; i < DEPTH_LAYERS; i += 1) {
      const t = i / (DEPTH_LAYERS - 1);
      g.poly(this.depthPolygon(t)).fill(
        winterWaterAt(t, this.palette.waterStops),
      );
    }
    g.poly(this.shorePolygon(0.012)).stroke({
      width: 2,
      color: this.palette.ice,
      alpha: 0.85,
    });
    g.poly(this.shorePolygon(0.002)).stroke({
      width: 1,
      color: this.palette.snowLight,
      alpha: 0.5,
    });

    // Loose stones and snow clumps break the silhouette further.
    for (let i = 0; i < 18; i += 1) {
      const angle = (i / 18) * Math.PI * 2 + 0.13;
      const scale = this.shoreScale(angle) + 0.03;
      const x = CENTER.x + Math.cos(angle) * RADIUS.x * scale;
      const y = CENTER.y + Math.sin(angle) * RADIUS.y * scale;
      g.ellipse(x, y, 4 + (i % 3) * 2, 2 + (i % 2)).fill({
        color: i % 3 === 0 ? this.palette.snowShade : this.palette.iceDeep,
        alpha: 0.75,
      });
      if (i % 2 === 0) {
        g.ellipse(x - 1, y - 1, 2.5, 1.2).fill({
          color: this.palette.snowLight,
          alpha: 0.8,
        });
      }
    }

    // A broken moon path and a few reflections, kept off the bank.
    for (let i = 0; i < 12; i += 1) {
      const width = Math.max(1, 7 - i * 0.5);
      g.rect(
        CENTER.x - width / 2 + Math.sin(i * 1.3) * 3,
        40 + i * 5,
        width,
        1,
      ).fill({
        color: 0xdbe8ff,
        alpha: 0.12 - i * 0.007,
      });
    }

    for (const disc of this.discs) {
      g.ellipse(disc.x, disc.y, disc.rx, disc.ry).fill({
        color: this.palette.ice,
        alpha: disc.alpha,
      });
      g.ellipse(
        disc.x - disc.rx * 0.2,
        disc.y - 0.5,
        disc.rx * 0.5,
        disc.ry * 0.5,
      ).fill({
        color: this.palette.snowLight,
        alpha: disc.alpha * 0.8,
      });
    }
  }

  /**
   * The floating trunks, each in its own container so it can ride the chop
   * without the rest of the lake being repainted.
   *
   * They used to be part of the painted background: a still lake with three
   * logs frozen into it, which made them read as decals on the water rather
   * than as wood the lake is carrying.
   */
  drawFloating(layer: Container): void {
    this.logs.forEach((log, index) => {
      const node = new Container();
      node.position.set(log.x, log.y);
      const g = new Graphics();
      // Drawn at the container's own origin; the placement lives on the node.
      drawFloatingLog(g, { ...log, x: 0, y: 0 }, this.palette);
      node.addChild(g);
      layer.addChild(node);
      this.trunks.push({
        node,
        baseX: log.x,
        baseY: log.y,
        // A different phase and pace per trunk: three logs bobbing in lockstep
        // would read as one animation, not as three objects on the water.
        phase: index * 2.1 + 0.35,
        speed: 0.42 + index * 0.05,
        roll: 0.011 + index * 0.004,
      });
    });
  }

  /** Heave, drift and roll of the trunks; the lake is calm, so all three stay small. */
  animate(time: number): void {
    for (const trunk of this.trunks) {
      const t = time * trunk.speed + trunk.phase;
      trunk.node.y = trunk.baseY + Math.sin(t) * 0.7;
      trunk.node.x = trunk.baseX + Math.sin(t * 0.47 + 1.1) * 0.6;
      trunk.node.rotation = Math.sin(t * 0.72 + 0.4) * trunk.roll;
    }
  }

  /** Deterministic noise so a preview screenshot matches the real scene. */
  private shoreScale(angle: number): number {
    return (
      1 +
      0.07 * Math.sin(angle * 3 + 0.7) +
      0.045 * Math.sin(angle * 7 + 2.4) +
      0.03 * Math.sin(angle * 11 + 5.1) +
      0.02 * Math.sin(angle * 19 + 1.9) +
      0.015 * Math.sin(angle * 29 + 0.3)
    );
  }

  private shorePolygon(scaleDelta: number, shrink = 1): number[] {
    const points: number[] = [];
    for (let i = 0; i < SHORE_POINTS; i += 1) {
      const angle = (i / SHORE_POINTS) * Math.PI * 2;
      const scale = (this.shoreScale(angle) + scaleDelta) * shrink;
      points.push(
        CENTER.x + Math.cos(angle) * RADIUS.x * scale,
        CENTER.y + Math.sin(angle) * RADIUS.y * scale,
      );
    }
    return points;
  }

  /** Raggedness of the deep basin: much coarser than the shoreline. */
  private deepScale(angle: number): number {
    return (
      1 +
      0.38 * Math.sin(angle * 2 + 1.1) +
      0.22 * Math.sin(angle * 3 - 0.6) +
      0.14 * Math.sin(angle * 5 + 2.2) +
      0.08 * Math.sin(angle * 7 + 4.4)
    );
  }

  /**
   * One depth contour: `t` = 0 is the shoreline, 1 the bottom of the basin.
   * Every contour blends the shore outline with the off-centre basin, so the
   * dark water drifts to one side and the shelves are wider on the other.
   *
   * Each contour is also dithered by up to a couple of pixels. Without that the
   * contours stay parallel and the one-unit colour step between neighbours
   * reads as a long staircase; with it the step scatters into water grain.
   */
  private depthPolygon(t: number): number[] {
    const points: number[] = [];
    const layer = Math.round(t * DEPTH_LAYERS);
    // The dither has to vanish at the shoreline, where the ice rim is drawn.
    const amp = Math.min(1, t * 6) * 2.1;
    for (let i = 0; i < SHORE_POINTS; i += 1) {
      const angle = (i / SHORE_POINTS) * Math.PI * 2;
      const scale = this.shoreScale(angle);
      const shoreX = CENTER.x + Math.cos(angle) * RADIUS.x * scale;
      const shoreY = CENTER.y + Math.sin(angle) * RADIUS.y * scale;
      const deep = this.deepScale(angle);
      const basinX = DEEP.x + Math.cos(angle) * DEEP_RADIUS.x * deep;
      const basinY = DEEP.y + Math.sin(angle) * DEEP_RADIUS.y * deep;
      points.push(
        lerp(shoreX, basinX, t) + ditherNoise(i, layer) * amp,
        lerp(shoreY, basinY, t) + ditherNoise(i + 977, layer) * amp,
      );
    }
    return points;
  }

  // ---------------------------------------------------------------- scenery

  drawScenery(props: Container): void {
    this.drawShoreReeds(props);

    // Dense ring of snowy firs and rocks follows the ragged shoreline.
    const trees = this.assets.trees;
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2 + 0.18;
      const scale = this.shoreScale(angle) + 0.1;
      const x = CENTER.x + Math.cos(angle) * RADIUS.x * scale;
      const y = CENTER.y + Math.sin(angle) * RADIUS.y * scale;
      const size = 0.72 + ((i * 7) % 5) * 0.09;
      const texture = trees[i % trees.length];
      // The near bank stands in front of the angler (z-sorted by its base), and
      // the bottom-centre fir put its canopy straight over his head and rod.
      // His mooring is a clearing: no foreground tree is planted on his column.
      if (this.hidesAngler(x, y, size, texture)) continue;
      drawSnowDrift(props, x, y, size, this.palette);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(x, y);
      sprite.scale.set(size);
      sprite.tint = 0x9fb3a8;
      sprite.zIndex = y;
      props.addChild(sprite);
    }

    // A second, darker row of firs out on the snowfield, behind that ring. The
    // lake fills most of the frame, so candidates that fall on the water or off
    // the frame are dropped: what is left lands in the corners and the side
    // strips, which is where the open snowfield actually is.
    const backTrees: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 34; i += 1) {
      const angle = (i / 34) * Math.PI * 2 + 0.52;
      const jitter = ditherNoise(i + 3, 71);
      const spread = this.shoreScale(angle) + 0.17 + Math.abs(jitter) * 0.13;
      const x = CENTER.x + Math.cos(angle) * RADIUS.x * spread;
      const y = CENTER.y + Math.sin(angle) * RADIUS.y * spread;
      if (x < 12 || x > VIEW.width - 12) continue;
      if (y < 14 || y > VIEW.height - 4) continue;
      // Keep the row from collapsing into one blob where the outline is tight.
      if (backTrees.some((tree) => Math.hypot(tree.x - x, tree.y - y) < 15)) {
        continue;
      }
      backTrees.push({ x, y });
      const size = 0.78 + Math.abs(jitter) * 0.42;
      if (this.hidesAngler(x, y, size, trees[i % trees.length])) continue;
      drawSnowDrift(props, x, y, size * 0.9, this.palette);
      const sprite = new Sprite(trees[i % trees.length]);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(x, y);
      sprite.scale.set(size);
      // A touch darker and bluer, so the new row sits behind the lit front one.
      sprite.tint = 0x83968d;
      sprite.zIndex = y;
      props.addChild(sprite);
    }

    // The four corners of the clearing: the lake's ragged hole leaves bare snow
    // there, and the ring of firs follows the bank rather than the frame, so the
    // corners stayed empty. These are placed by hand, outside the water outline.
    const corners: Array<[number, number, number]> = [
      [17, 34, 0.95],
      [54, 15, 0.8],
      [25, 70, 0.7],
      [462, 33, 0.95],
      [428, 17, 0.78],
      [16, 246, 0.9],
      [50, 264, 0.82],
      [466, 250, 0.9],
      [432, 266, 0.75],
    ];
    for (const [x, y, size] of corners) {
      drawSnowDrift(props, x, y, size, this.palette);
      const sprite = new Sprite(trees[Math.round(x + y) % trees.length]);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(x, y);
      sprite.scale.set(size);
      // The same darker tint as the back row: these read as the forest edge.
      sprite.tint = 0x83968d;
      sprite.zIndex = y;
      props.addChild(sprite);
    }

    // Stones on the bank, drawn rather than pasted: the pack's rock sprite read
    // as a bomb with spikes next to the hand-built firs.
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + 0.9;
      const scale = this.shoreScale(angle) + 0.025;
      const x = CENTER.x + Math.cos(angle) * RADIUS.x * scale;
      const y = CENTER.y + Math.sin(angle) * RADIUS.y * scale;
      const size = 0.8 + (i % 3) * 0.15;
      drawSnowDrift(props, x, y, size * 0.6, this.palette);
      drawShoreStone(props, x, y - 1, size * 0.85, this.palette);
    }

    // A leaning warning sign and frost-burnt grass on the bank.
    this.drawShoreSign(props, 2.55);
    this.drawGrass(props, 3.35);
    this.drawGrass(props, 5.15);

    this.drawBoat(props);
    this.drawLampFixture(props);
  }

  private drawShoreSign(props: Container, angle: number): void {
    const scale = this.shoreScale(angle) + 0.08;
    const x = CENTER.x + Math.cos(angle) * RADIUS.x * scale;
    const y = CENTER.y + Math.sin(angle) * RADIUS.y * scale;
    const sign = new Sprite(this.assets.sign);
    sign.anchor.set(0.5, 1);
    sign.position.set(x, y);
    sign.rotation = -0.12;
    sign.scale.set(1.1);
    sign.zIndex = y;
    props.addChild(sign);
    const snow = new Graphics();
    snow.ellipse(x - 1, y + 1, 6, 2).fill({
      color: this.palette.snowLight,
      alpha: 0.7,
    });
    snow.zIndex = y + 0.1;
    props.addChild(snow);
  }

  private drawGrass(props: Container, angle: number): void {
    const scale = this.shoreScale(angle) + 0.07;
    const x = CENTER.x + Math.cos(angle) * RADIUS.x * scale;
    const y = CENTER.y + Math.sin(angle) * RADIUS.y * scale;
    drawGrassTuft(props, x, y, 0x8f7a58, 1, 1);
  }

  /**
   * Reeds where the bank meets the water.
   *
   * The lake's edge was bare snow between the firs: a still-water shore has
   * cattails on the ice rim, and the clump drawing is shared with the river, so
   * both waters grow the same plant. Every clump sits just outside the water
   * outline, the far band stays clear (the fir line hides it anyway) and the
   * angler's mooring is kept open.
   */
  private drawShoreReeds(props: Container): void {
    const { x: anglerX, y: anglerY } = this.layout.angler;
    const angles = [0.22, 0.72, 1.18, 1.62, 2.06, 2.5, 2.88];
    angles.forEach((angle, index) => {
      const scale = this.shoreScale(angle) + 0.022;
      const x = CENTER.x + Math.cos(angle) * RADIUS.x * scale;
      const y = CENTER.y + Math.sin(angle) * RADIUS.y * scale;
      if (x < 14 || x > VIEW.width - 14) return;
      if (y < 96 || y > VIEW.height - 10) return;
      if (Math.hypot(x - anglerX, y - anglerY) < 46) return;
      drawReedClump(
        props,
        x,
        y,
        this.palette,
        0.95 + (index % 3) * 0.14,
        index + 1,
      );
    });
  }

  /**
   * True when a fir would stand between the camera and the angler.
   *
   * Props are z-sorted by their base line, so only a tree whose base is below
   * the angler is drawn over him; such a tree can still be tall enough for its
   * canopy to reach back up across his head and rod. Those are the ones the
   * lake has to leave out of the near bank.
   */
  private hidesAngler(
    x: number,
    y: number,
    size: number,
    texture: Texture,
  ): boolean {
    const { angler } = this.layout;
    if (y <= angler.y) return false;
    const halfWidth = (texture.width * size) / 2;
    const top = y - texture.height * size;
    return (
      x + halfWidth > angler.x - 18 &&
      x - halfWidth < angler.x + 18 &&
      top < angler.y - 4
    );
  }

  private drawBoat(props: Container): void {
    const { x, y } = this.layout.angler;
    // Hull, snow and water shade share one container: the shadow then rocks
    // with the boat instead of staying screen-aligned.
    const boat = new Container();
    boat.position.set(x, y + 2);
    boat.rotation = -0.04;
    boat.zIndex = y - 0.5;
    props.addChild(boat);

    // The skiff is a narrow top-down hull, so its shadow is the hull's own
    // footprint pushed down-right, read only as a dark rim along the keel. The
    // old shadow was one 50×14 horizontal ellipse — six times wider than the
    // hull — which read as a hole punched in the lake rather than as water
    // shaded by the boat.
    const shade = mixColor(this.palette.waterStops[2].color, 0x020a10, 0.55);
    const shadow = new Graphics();
    shadow
      .roundRect(-6.8, -17.4, 15.6, 31.2, 3.6)
      .fill({ color: shade, alpha: 0.14 });
    shadow
      .roundRect(-5.4, -16.1, 13.4, 29.2, 3.1)
      .fill({ color: shade, alpha: 0.32 });
    boat.addChild(shadow);

    // Frame 1 is the vertical hull, which reads as a boat seen from above.
    const hull = new Sprite(this.assets.boat[1] ?? this.assets.boat[0]);
    hull.anchor.set(0.5, 0.58);
    hull.scale.set(0.58);
    boat.addChild(hull);

    const snow = new Graphics();
    snow.ellipse(-12, -10, 7, 2).fill({
      color: this.palette.snowLight,
      alpha: 0.75,
    });
    snow.ellipse(10, -9, 5, 1.6).fill({
      color: this.palette.snow,
      alpha: 0.6,
    });
    boat.addChild(snow);
  }

  private drawLampFixture(props: Container): void {
    const light = this.layout.light;
    if (!light) return;
    const g = new Graphics();
    const x = light.x;
    const y = light.y;
    g.rect(x - 1, y - 12, 2, 12).fill(C.brownDark);
    g.rect(x - 4, y - 15, 8, 2).fill(C.ink);
    g.rect(x - 3, y - 13, 6, 5).fill({ color: C.ink, alpha: 0.92 });
    g.rect(x - 2, y - 12, 4, 3).fill({ color: 0x34321f, alpha: 0.95 });
    g.zIndex = y;
    props.addChild(g);
  }

  // ----------------------------------------------------------------- motion

  drawMotion(g: Graphics, time: number, cloudiness = 0): void {
    g.clear();

    // The water first: mist and wisps drift over it, never under.
    this.water.draw(g, time, cloudiness);

    // Drifting mist over the water.
    for (let i = 0; i < 5; i += 1) {
      const x = CENTER.x + Math.sin(time * 0.12 + i) * 120 - 60 + i * 28;
      const y = 92 + i * 11 + Math.sin(time * 0.3 + i * 2) * 3;
      g.ellipse(x, y, 60, 7).fill({
        color: this.palette.snowLight,
        alpha: 0.025,
      });
    }

    // Pale wisps in the reeds.
    for (const wisp of this.wisps) {
      const pulse = (Math.sin(time * wisp.speed + wisp.phase) + 1) / 2;
      g.circle(wisp.x, wisp.y, wisp.radius * (0.7 + pulse * 0.7)).fill({
        color: 0x9fe8d8,
        alpha: 0.12 + pulse * 0.18,
      });
      g.circle(wisp.x, wisp.y, 1).fill({
        color: 0xd8fff2,
        alpha: 0.5 + pulse * 0.4,
      });
    }

    // Bubbles rising from the bottom.
    for (const bubble of this.bubbles) {
      const y = CENTER.y + 90 - ((time * bubble.speed + bubble.y) % 150);
      g.circle(bubble.x + Math.sin(time + bubble.phase) * 2, y, 1).stroke({
        width: 1,
        color: this.palette.snow,
        alpha: 0.16,
      });
    }
  }

  // ------------------------------------------------------------------ water

  isWater(x: number, y: number): boolean {
    const nx = (x - CENTER.x) / RADIUS.x;
    const ny = (y - CENTER.y) / RADIUS.y;
    const radius = Math.hypot(nx, ny);
    if (radius > this.shoreScale(Math.atan2(ny, nx))) return false;
    const { x: ax, y: ay } = this.layout.angler;
    if (x >= ax - 21 && x <= ax + 21 && y >= ay - 16 && y <= ay + 6) {
      return false;
    }
    return true;
  }
}
