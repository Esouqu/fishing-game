import { Container, Graphics, Sprite } from "pixi.js";
import type { AssetBag } from "../../assets";
import type { AreaDef, SceneLayout } from "../../areas";
import { C, VIEW } from "../../config";
import { randRange } from "../../utils";
import { mixColor, winterWaterAt } from "../../world";
import { drawDepthRamp } from "./dither";
import { drawGrassTuft } from "./grass";
import { drawShoreStone, drawSnowDrift, drawBucket } from "./props";
import type { SceneRenderer } from "./types";
import { WaterSurface } from "./water";

const SHORE_X = 54;
const DOCK = { x: 48, y: 122, width: 124, bottom: 152 };
/** Rowboat moored along the underside of the pier. */
const MOORED_BOAT = { x: 134, y: 174 };

interface Ripple {
  x: number;
  y: number;
  length: number;
  bend: number;
  slope: number;
  alpha: number;
  width: number;
  color: number;
}

interface WaterMark {
  x: number;
  y: number;
  radius: number;
  phase: number;
  speed: number;
  alpha: number;
}

interface Whirl {
  x: number;
  y: number;
  radius: number;
  phase: number;
  spin: number;
  alpha: number;
}

/** A sparkle that blinks on the open water. */
interface Glint {
  x: number;
  y: number;
  phase: number;
  speed: number;
  size: number;
}

interface ScenerySpot {
  x: number;
  y: number;
  scale: number;
  flip?: boolean;
}

/** Deterministic 0..1 noise: the sea surface must match in every preview. */
function noise(index: number, salt = 0): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** Calm northern bay: left snow bank, pier, open water, a moored rowboat. */
export class CoveRenderer implements SceneRenderer {
  readonly layout: SceneLayout;
  private readonly area: AreaDef;
  private readonly assets: AssetBag;
  private readonly ripples: Ripple[] = [];
  private readonly waterMarks: WaterMark[] = [];
  private readonly whirls: Whirl[] = [];
  private readonly glints: Glint[] = [];
  /** Boat hull, rocked around {@link MOORED_BOAT} every frame. */
  private boat: Container | null = null;
  /** Living surface: the bay has the most wind of the three waters. */
  private readonly water: WaterSurface;

  constructor(assets: AssetBag, area: AreaDef) {
    this.assets = assets;
    this.area = area;
    this.layout = area.layout;
    this.addWaterRipples();
    this.addWaterMarks();

    this.water = new WaterSurface({
      palette: this.palette,
      isWater: (x, y) => this.isWater(x, y),
      // Open water in a steady breeze: quick drift, short and tall crests.
      flow: 12,
      energy: 0.85,
      chops: 54,
      sheens: 6,
      pops: 5,
    });
  }

  private get palette() {
    return this.area.palette;
  }

  private shoreEdgeAt(y: number): number {
    return SHORE_X + Math.sin(y * 0.065) * 3.2 + Math.sin(y * 0.17 + 1.7) * 1.6;
  }

  // ------------------------------------------------------------------ world

  drawWorld(g: Graphics): void {
    const shore = SHORE_X;

    g.rect(0, 0, VIEW.width, VIEW.height).fill(this.palette.waterFar);

    // Depth bands from the bank to the open sea. The ramp starts a little left
    // of the nominal shore so the wavy bank never shows a gap, runs to the
    // right edge of the frame (the bay has no far bank) and is dithered, so the
    // dark side does not band into vertical stripes.
    drawDepthRamp(g, {
      axis: "x",
      from: shore - 10,
      to: VIEW.width,
      stops: this.palette.waterStops,
    });

    // Open sea reads through its surface, not through its depth ramp: a field
    // of short wavelets, a few breaking crests and sparkles on top of it.
    this.drawChop(g);
    this.drawCrests(g);
    this.drawSparkles(g);
    this.drawWaterRipples(g);
    this.drawFoam(g);

    // Slush and drift ice near the left bank.
    this.drawIce(g, this.shoreEdgeAt(24) + 6, 24, 15, 3);
    this.drawIce(g, this.shoreEdgeAt(92) + 9, 92, 9, 2);
    this.drawIce(g, this.shoreEdgeAt(158) + 5, 158, 12, 2.5);
    this.drawIce(g, this.shoreEdgeAt(222) + 10, 222, 17, 3);
    this.drawIce(g, this.shoreEdgeAt(262) + 6, 262, 10, 2);

    // A few loose floes drifting in the open water.
    this.drawIce(g, 268, 46, 10, 2.2);
    this.drawIce(g, 352, 196, 13, 2.6);
    this.drawIce(g, 424, 84, 8, 1.8);
    for (let i = 0; i < 26; i += 1) {
      const y = 16 + ((i * 41) % (VIEW.height - 28));
      const x = this.shoreEdgeAt(y) + 2 + ((i * 17) % 18);
      g.rect(x, y, 1, 1).fill({
        color: i % 3 === 0 ? this.palette.snow : this.palette.ice,
        alpha: 0.35,
      });
    }

    this.drawShore(g);
    this.drawDock(g);
  }

  private addWaterRipples(): void {
    for (let i = 0; i < 44; i += 1) {
      this.ripples.push({
        x: randRange(SHORE_X + 12, VIEW.width - 22),
        y: randRange(24, VIEW.height - 10),
        length: randRange(4, 22),
        bend: randRange(-2.2, 2.2),
        slope: randRange(-0.7, 0.7),
        alpha: randRange(0.03, 0.11),
        width: Math.random() > 0.82 ? 1.5 : 1,
        color:
          i % 4 === 0
            ? this.palette.snow
            : i % 3 === 0
              ? this.palette.snowLight
              : this.palette.ice,
      });
    }

    for (let i = 0; i < 4; i += 1) {
      this.ripples.push({
        x: randRange(SHORE_X + 30, VIEW.width - 34),
        y: randRange(36, VIEW.height - 24),
        length: randRange(5, 9),
        bend: randRange(0.4, 1.2),
        slope: randRange(-0.4, 0.4),
        alpha: randRange(0.04, 0.08),
        width: 1,
        color: this.palette.snow,
      });
    }
  }

  /**
   * Wind chop: the sea surface is a texture of short, staggered wavelets.
   *
   * The bay used to be a flat depth ramp with a couple of dozen long ripple
   * lines on it, which read as an empty blue field. This is the reference look
   * from the sea screenshot: dense little crests, brighter near the shore,
   * fading into the distance so the frame does not turn into patterned noise.
   */
  private drawChop(g: Graphics): void {
    let row = 0;
    for (let y = 7; y < VIEW.height - 3; y += 5 + noise(row, 1) * 4, row += 1) {
      // Each row starts at its own offset and steps at its own pace: a fixed
      // grid turned the surface into a visible lattice of dashes.
      for (
        let x = SHORE_X + 2 + noise(row, 13) * 9;
        x < VIEW.width - 2;
        x += 7 + noise(row * 7 + Math.round(x), 15) * 7
      ) {
        const seed = noise(row * 31 + Math.round(x), 7);
        if (seed < 0.2) continue;
        const px = x + (noise(row * 17 + Math.round(x), 3) - 0.5) * 9;
        const py = y + (noise(row * 13 + Math.round(x), 5) - 0.5) * 5;
        if (!this.isWater(px, py)) continue;

        const length = 2.5 + seed * 7;
        const bend = (noise(Math.round(row + x), 9) - 0.5) * 2;
        const depth = (px - SHORE_X) / (VIEW.width - SHORE_X);
        const tone =
          noise(row * 7 + Math.round(x), 11) > 0.4
            ? this.palette.snowLight
            : this.palette.ice;
        // Near the bank the crests are crisp; by the horizon they flatten out.
        const alpha = (0.07 + seed * 0.14) * (1 - depth * 0.4);
        g.moveTo(px, py);
        g.quadraticCurveTo(
          px + length * 0.5,
          py + bend,
          px + length,
          py + bend * 0.4,
        );
        g.stroke({ width: 1, color: tone, alpha });
        // The shade under a crest is what makes it stand up.
        if (seed > 0.68) {
          g.moveTo(px + 1, py + 1);
          g.lineTo(px + length * 0.7, py + 1 + bend * 0.3);
          g.stroke({
            width: 1,
            color: this.palette.waterFar,
            alpha: alpha * 0.45,
          });
        }
        // Every so often the crest breaks into a speck of foam.
        if (seed > 0.9) {
          g.rect(px + length * 0.6, py - 1, 1, 1).fill({
            color: this.palette.snowLight,
            alpha: 0.5,
          });
        }
      }
    }
  }

  /** A handful of breaking crests: a bright lip over a darker trough. */
  private drawCrests(g: Graphics): void {
    for (let i = 0; i < 30; i += 1) {
      const x = SHORE_X + 16 + noise(i, 41) * (VIEW.width - SHORE_X - 28);
      const y = 12 + noise(i, 42) * (VIEW.height - 26);
      if (!this.isWater(x, y)) continue;
      const width = 5 + noise(i, 43) * 10;
      const lip = 1.2 + noise(i, 44) * 1.4;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + width * 0.5, y - lip, x + width, y + 0.4);
      g.stroke({
        width: 1,
        color: this.palette.snowLight,
        alpha: 0.16 + noise(i, 45) * 0.16,
      });
      g.moveTo(x + 1, y + 1);
      g.quadraticCurveTo(
        x + width * 0.5,
        y + 1.6 - lip * 0.4,
        x + width * 0.9,
        y + 1.2,
      );
      g.stroke({
        width: 1,
        color: this.palette.waterFar,
        alpha: 0.12 + noise(i, 46) * 0.1,
      });
    }
  }

  /** Static glints: single bright pixels, the brightest of them twinkle. */
  private drawSparkles(g: Graphics): void {
    for (let i = 0; i < 210; i += 1) {
      const x = SHORE_X + 2 + noise(i, 51) * (VIEW.width - SHORE_X - 4);
      const y = 5 + noise(i, 52) * (VIEW.height - 10);
      if (!this.isWater(x, y)) continue;
      const bright = noise(i, 53);
      g.rect(x, y, 1, 1).fill({
        color: this.palette.snowLight,
        alpha: 0.16 + bright * 0.4,
      });
      if (bright > 0.86) {
        g.rect(x, y + 1, 2, 1).fill({
          color: this.palette.snowLight,
          alpha: 0.3,
        });
      }
    }
  }

  /**
   * Foam where the swell meets the snowy bank: a broken line two pixels off
   * the shore, thicker and brighter at the little points of the bank.
   */
  private drawFoam(g: Graphics): void {
    for (let y = 0; y < VIEW.height; y += 3) {
      const edge = this.shoreEdgeAt(y) + 3;
      const seed = noise(y, 61);
      if (seed < 0.42) continue;
      g.rect(edge, y, 1 + Math.round(seed * 3), 1).fill({
        color: this.palette.snowLight,
        alpha: 0.18 + seed * 0.32,
      });
      if (seed > 0.8) {
        g.rect(edge + 4, y + 1, 2, 1).fill({
          color: this.palette.ice,
          alpha: 0.35,
        });
      }
    }
  }

  private drawWaterRipples(g: Graphics): void {
    for (const ripple of this.ripples) {
      g.moveTo(ripple.x, ripple.y);
      g.quadraticCurveTo(
        ripple.x + ripple.length * 0.5,
        ripple.y + ripple.bend,
        ripple.x + ripple.length,
        ripple.y + ripple.slope,
      );
      g.stroke({
        width: ripple.width,
        color: ripple.color,
        alpha: ripple.alpha,
      });
      if (ripple.length > 14 && ripple.alpha > 0.065) {
        g.rect(
          ripple.x + ripple.length - 1,
          ripple.y + ripple.slope - 1,
          1,
          1,
        ).fill({
          color: this.palette.snowLight,
          alpha: Math.min(0.9, ripple.alpha * 1.3),
        });
      }
    }
  }

  private drawIce(
    g: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    g.ellipse(x, y, width, height).fill({
      color: this.palette.iceDeep,
      alpha: 0.3,
    });
    g.ellipse(x, y - 0.8, width * 0.92, height * 0.72).fill({
      color: this.palette.ice,
      alpha: 0.6,
    });
    g.ellipse(x - width * 0.16, y - 1.2, width * 0.42, height * 0.36).fill({
      color: this.palette.snowLight,
      alpha: 0.7,
    });
    g.rect(x - width * 0.35, y + height * 0.15, width * 0.7, 1).fill({
      color: this.palette.iceDeep,
      alpha: 0.45,
    });
  }

  private drawShore(g: Graphics): void {
    const height = VIEW.height;

    // Snow field follows a soft, irregular bank instead of a straight edge.
    const snowPoly: number[] = [0, 0];
    for (let y = 0; y <= height; y += 2) {
      snowPoly.push(this.shoreEdgeAt(y), y);
    }
    snowPoly.push(0, height);
    g.poly(snowPoly).fill(this.palette.snowShade);

    const innerPoly: number[] = [0, 0];
    for (let y = 0; y <= height; y += 2) {
      innerPoly.push(this.shoreEdgeAt(y) - 6, y);
    }
    innerPoly.push(0, height);
    g.poly(innerPoly).fill(this.palette.snow);

    for (let y = 0; y < height; y += 29) {
      const driftX = this.shoreEdgeAt(y) - 18 - ((y * 11) % 13);
      g.ellipse(driftX, y + 8, 11, 3.5).fill({
        color: this.palette.snowShade,
        alpha: 0.5,
      });
      g.ellipse(driftX + 2, y + 6, 9, 2.5).fill({
        color: this.palette.snowLight,
        alpha: 0.75,
      });
    }

    for (let y = 12; y < height; y += 41) {
      const tuftX = this.shoreEdgeAt(y) - 18 - ((y * 5) % 9);
      g.rect(tuftX, y + 4, 1, 4).fill({ color: 0x7d6a4f, alpha: 0.65 });
      g.rect(tuftX + 3, y + 5, 1, 3).fill({ color: 0x8f7a58, alpha: 0.5 });
    }

    // Icy shelf follows the same wavy water line.
    const traceEdge = (offset: number): void => {
      g.moveTo(this.shoreEdgeAt(0) + offset, 0);
      for (let y = 2; y <= height; y += 2) {
        g.lineTo(this.shoreEdgeAt(y) + offset, y);
      }
    };
    traceEdge(0);
    g.stroke({ width: 9, color: this.palette.ice });
    traceEdge(-2);
    g.stroke({ width: 2, color: this.palette.snowLight, alpha: 0.75 });
    traceEdge(1);
    g.stroke({ width: 2, color: this.palette.iceDeep, alpha: 0.9 });
    traceEdge(0);
    g.stroke({ width: 1, color: 0x1b4a5e, alpha: 0.55 });

    for (let y = 0; y < height; y += 23) {
      const crackY = y + ((y * 3) % 9);
      const edge = this.shoreEdgeAt(crackY);
      g.moveTo(edge - 8, crackY)
        .lineTo(edge - 4, crackY + 4)
        .lineTo(edge - 5, crackY + 8)
        .stroke({ width: 1, color: this.palette.snow, alpha: 0.55 });
    }

    // A handful of sparkles so the snow does not read as flat paper.
    for (let i = 0; i < 30; i += 1) {
      const sx = 4 + ((i * 23) % 40);
      const sy = 6 + ((i * 37) % (height - 12));
      if ((sx + sy) % 4 === 0) {
        g.rect(sx, sy, 1, 1).fill({
          color: this.palette.snowLight,
          alpha: 0.9,
        });
      }
    }
  }

  private drawDock(g: Graphics): void {
    const x = DOCK.x;
    const y = DOCK.y;
    const width = DOCK.width;
    const height = DOCK.bottom - y;

    // Horizontal walkway: cold shadow, deck and darker side edges.
    g.rect(x + 5, y + 5, width, height).fill({
      color: 0x0a2030,
      alpha: 0.4,
    });
    g.rect(x, y, width, height).fill(C.brown);
    g.rect(x, y, width, 3).fill(C.brownLight);
    g.rect(x, y, 2, height).fill(C.brownDark);
    g.rect(x + width - 2, y, 2, height).fill(C.brownDark);
    g.rect(x + 2, y + height - 2, width - 4, 2).fill({
      color: C.brownDark,
      alpha: 0.75,
    });

    // Cross-planks run vertically along the length of the pier.
    for (let px = x + 7; px < x + width - 2; px += 9) {
      g.rect(px, y + 2, 1, height - 4).fill({
        color: C.brownDark,
        alpha: 0.7,
      });
      g.rect(px + 2, y + 6 + ((px * 7) % 14), 1, 2).fill({
        color: C.brownDark,
        alpha: 0.4,
      });
    }

    // Snow settled on the planks and posts.
    g.rect(x + 2, y + 2, width - 4, 2).fill({
      color: this.palette.snow,
      alpha: 0.6,
    });
    for (let px = x + 4; px < x + width - 6; px += 13) {
      const patch = 4 + ((px * 7) % 5);
      g.rect(px, y + 3, patch, 2).fill({
        color: this.palette.snowLight,
        alpha: 0.75,
      });
      g.rect(px, y + height - 4, patch - 1, 1).fill({
        color: this.palette.snow,
        alpha: 0.45,
      });
    }
    g.ellipse(x + width - 10, y + 5, 9, 3).fill({
      color: this.palette.snowLight,
      alpha: 0.85,
    });

    // Support posts on the water and shore sides, with snow caps.
    for (let px = x + 10; px < x + width - 6; px += 30) {
      g.rect(px, y - 3, 9, 4).fill(C.brownDark);
      g.rect(px, y + height - 1, 9, 4).fill(C.brownDark);
      g.rect(px, y - 3, 9, 2).fill(C.brownLight);
      g.rect(px, y + height - 1, 9, 2).fill(C.brownLight);
      g.rect(px, y - 4, 9, 2).fill({
        color: this.palette.snow,
        alpha: 0.9,
      });
      g.rect(px, y + height + 2, 9, 1).fill({
        color: this.palette.snowShade,
        alpha: 0.7,
      });
    }
  }

  // ---------------------------------------------------------------- scenery

  drawScenery(props: Container): void {
    const addMound = (item: ScenerySpot, scale: number): void => {
      drawSnowDrift(props, item.x, item.y, scale, this.palette);
    };

    const treeSpots: ScenerySpot[] = [
      { x: 29, y: 78, scale: 1.1, flip: false },
      { x: 26, y: 172, scale: 0.95, flip: true },
      { x: 32, y: 266, scale: 1.15, flip: false },
      { x: 46, y: 58, scale: 0.85, flip: true },
    ];
    treeSpots.forEach((item, index) => {
      addMound(item, item.scale);
      const texture = this.assets.trees[index % this.assets.trees.length];
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(item.x, item.y);
      sprite.scale.set(item.flip ? -item.scale : item.scale, item.scale);
      sprite.zIndex = item.y;
      props.addChild(sprite);
    });

    const bushSpots: ScenerySpot[] = [
      { x: 10, y: 108, scale: 1.1 },
      { x: 40, y: 116, scale: 0.8 },
      { x: 18, y: 214, scale: 1.1 },
      { x: 46, y: 230, scale: 0.9 },
    ];
    bushSpots.forEach((item, index) => {
      addMound(item, item.scale * 0.7);
      const texture = this.assets.bushes[index % this.assets.bushes.length];
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(item.x, item.y);
      sprite.scale.set(item.scale);
      sprite.zIndex = item.y;
      props.addChild(sprite);
    });

    const rockSpots: ScenerySpot[] = [
      { x: 36, y: 198, scale: 1 },
      { x: 24, y: 62, scale: 0.9 },
      { x: 48, y: 248, scale: 0.8 },
    ];
    rockSpots.forEach((item) => {
      drawSnowDrift(props, item.x, item.y, item.scale * 0.6, this.palette);
      drawShoreStone(
        props,
        item.x,
        item.y - 1,
        item.scale * 0.85,
        this.palette,
      );
    });

    drawBucket(props, 134, 148);

    this.drawMooredBoat(props);
    this.drawCoveExtras(props);
    this.drawLanternBody(props);
  }

  /**
   * The rowboat, tied along the underside of the pier. It sits low in the
   * water: the submerged slice of the hull is repainted with the local water
   * colour, a foam seam marks the waterline and the whole hull rocks with the
   * swell in {@link animate}.
   *
   * The sprite ships with a pale water band under the keel, which in the scene
   * read as a white shelf. It is now covered with water, and the shadow is the
   * hull's own rounded footprint pushed under the waterline instead of an
   * ellipse floating next to the boat.
   */
  private drawMooredBoat(props: Container): void {
    const { x, y } = MOORED_BOAT;
    const water = winterWaterAt(
      (x - SHORE_X) / (VIEW.width - SHORE_X),
      this.palette.waterStops,
    );

    const boat = new Container();
    boat.position.set(x, y);
    boat.rotation = 0.015;

    // Contact shadow, drawn behind the hull: a soft stack that hugs the keel
    // and fades outward, instead of one hard ellipse floating next to the boat.
    const shadow = new Graphics();
    shadow
      .roundRect(-20.4, 6.0, 40.8, 3.2, 1.6)
      .fill({ color: 0x061c2b, alpha: 0.3 });
    shadow
      .roundRect(-18.6, 7.4, 37.2, 3.4, 1.7)
      .fill({ color: 0x061c2b, alpha: 0.16 });
    shadow
      .roundRect(-15.4, 9.0, 30.8, 3.2, 1.6)
      .fill({ color: 0x061c2b, alpha: 0.08 });
    boat.addChild(shadow);

    const hull = new Sprite(this.assets.boat[0] ?? this.assets.boat[1]);
    hull.anchor.set(0.5, 0.55);
    hull.scale.set(0.74);
    boat.addChild(hull);

    // The pale band under the keel is the boat's painted boot stripe, not
    // water: it belongs to the hull. What sells the waterline is the dark seam
    // at its lower edge plus a soft contact shadow spreading under the hull.
    // Repainting the stripe in water colours turned it into a white shelf.
    const contact = mixColor(water, this.palette.waterFar, 0.6);
    const wash = new Graphics();
    wash
      .roundRect(-19.8, 6.2, 39.6, 1.1, 0.5)
      .fill({ color: contact, alpha: 0.55 });
    // Water lapping at the hull: a few broken ticks instead of a solid line.
    for (const [tx, tw] of [
      [-14, 5],
      [-4, 7],
      [7, 4],
      [13, 3],
    ] as const) {
      wash
        .roundRect(tx, 6.0, tw, 0.7, 0.35)
        .fill({ color: this.palette.snowLight, alpha: 0.3 });
    }
    boat.addChild(wash);

    // Two thwarts and a stowed oar: the hull reads as an open rowboat instead
    // of a floating box.
    const gear = new Graphics();
    gear.rect(-16, -6.5, 32, 2).fill({ color: 0x6a4a33, alpha: 0.9 });
    gear.rect(-16, 0.5, 32, 2).fill({ color: 0x5b3f2c, alpha: 0.9 });
    gear
      .moveTo(-13, -8)
      .lineTo(19, 3)
      .stroke({ width: 1, color: 0x8a6a4a, alpha: 0.85 });
    gear
      .moveTo(-13, -8)
      .lineTo(-8, -9.5)
      .stroke({ width: 2, color: 0x8a6a4a, alpha: 0.85 });
    boat.addChild(gear);

    // The mooring rope runs up to the nearest pier post.
    const rope = new Graphics();
    rope
      .moveTo(-20, -6)
      .quadraticCurveTo(-25, -15, -18, -24)
      .stroke({ width: 1, color: 0xc9b184, alpha: 0.7 });
    boat.addChild(rope);

    boat.zIndex = y;
    props.addChild(boat);
    this.boat = boat;
  }

  /**
   * Swell: the moored hull rolls with the water.
   *
   * It used to bob vertically by ±1.4 px as well, but the renderer rounds
   * sprite positions, so a slow subpixel sine became a hold and a one-pixel
   * jump — the boat read as stuttering in place. Rotation is not rounded, so
   * the roll alone carries the swell smoothly.
   */
  animate(time: number): void {
    if (!this.boat) return;
    this.boat.rotation = Math.sin(time * 1.1 + 0.6) * 0.028;
  }

  private drawCoveExtras(props: Container): void {
    // A signpost between the bank trees.
    const sign = new Sprite(this.assets.sign);
    sign.anchor.set(0.5, 1);
    sign.position.set(30, 120);
    sign.scale.set(1.15);
    sign.zIndex = 120;
    props.addChild(sign);

    for (const [x, y, flip] of [
      [24, 152, 1],
      [18, 208, -1],
      [20, 250, 1],
      [48, 240, -1],
    ] as const) {
      drawGrassTuft(props, x, y, 0x8f7a58, flip, 1.1);
    }
  }

  private drawLanternBody(props: Container): void {
    const light = this.layout.light;
    if (!light) return;
    const x = light.x;
    const y = light.y;
    const g = new Graphics();
    g.ellipse(x - 2, y + 1, 6, 2.5).fill({
      color: this.palette.snowShade,
      alpha: 0.8,
    });
    g.rect(x - 1, y - 8, 2, 8).fill(C.brownDark);
    g.rect(x - 1, y - 8, 1, 8).fill(C.brownLight);
    g.rect(x - 4, y - 11, 8, 2).fill(C.ink);
    g.rect(x - 3, y - 12, 6, 1).fill(this.palette.snow);
    g.rect(x - 3, y - 9, 6, 5).fill({ color: C.ink, alpha: 0.92 });
    g.rect(x - 2, y - 8, 4, 3).fill({ color: 0x34321f, alpha: 0.95 });
    g.rect(x - 3, y - 4, 6, 1).fill(C.brownDark);
    g.zIndex = y;
    props.addChild(g);
  }

  // ----------------------------------------------------------------- motion

  private addWaterMarks(): void {
    for (let i = 0; i < 22; i += 1) {
      this.waterMarks.push({
        x: randRange(SHORE_X + 24, VIEW.width - 26),
        y: randRange(30, VIEW.height - 14),
        radius: randRange(5, 13),
        phase: randRange(0, Math.PI * 2),
        speed: randRange(0.45, 1.15),
        alpha: randRange(0.05, 0.12),
      });
    }

    for (let i = 0; i < 2; i += 1) {
      this.whirls.push({
        x: randRange(SHORE_X + 36, VIEW.width - 40),
        y: randRange(60, 210),
        radius: randRange(8, 13),
        phase: randRange(0, Math.PI * 2),
        spin: randRange(0.16, 0.32),
        alpha: randRange(0.05, 0.085),
      });
    }

    // Twinkles on top of the static sparkles: the sea surface has to move
    // somewhere, now that the long ripple lines are only a background layer.
    for (let i = 0; i < 46; i += 1) {
      this.glints.push({
        x: randRange(SHORE_X + 18, VIEW.width - 10),
        y: randRange(12, VIEW.height - 8),
        phase: randRange(0, Math.PI * 2),
        speed: randRange(1.4, 3.6),
        size: Math.random() > 0.82 ? 2 : 1,
      });
    }
  }

  drawMotion(g: Graphics, time: number, cloudiness = 0): void {
    g.clear();

    this.water.draw(g, time, cloudiness);

    // Sunlight breaking on the wavelets.
    for (const glint of this.glints) {
      const pulse = (Math.sin(time * glint.speed + glint.phase) + 1) / 2;
      if (pulse < 0.55) continue;
      g.rect(glint.x, glint.y, glint.size, 1).fill({
        color: 0xf7fbfd,
        alpha: (pulse - 0.55) * 1.5,
      });
    }

    for (const mark of this.waterMarks) {
      const pulse = (Math.sin(time * mark.speed + mark.phase) + 1) / 2;
      const radius = mark.radius * (0.65 + pulse * 0.45);
      g.ellipse(mark.x, mark.y, radius, radius * 0.38).stroke({
        width: 1,
        color: this.palette.ice,
        alpha: mark.alpha * (0.4 + pulse * 0.6),
      });
      if (pulse > 0.72) {
        g.rect(mark.x - 1, mark.y - radius * 0.38 - 2, 2, 1).fill({
          color: this.palette.snow,
          alpha: mark.alpha * 0.8,
        });
      }
    }

    for (const whirl of this.whirls) {
      const angle = time * whirl.spin + whirl.phase;
      for (let i = 0; i < 3; i += 1) {
        const radius = whirl.radius * (0.45 + i * 0.17);
        const start = angle + (i * Math.PI * 2) / 3;
        // `arc()` connects the current path to the arc start, which produced a
        // stray diagonal line across the lake. Move to the start point first.
        g.moveTo(
          whirl.x + Math.cos(start) * radius,
          whirl.y + Math.sin(start) * radius,
        );
        g.arc(whirl.x, whirl.y, radius, start, start + 0.72).stroke({
          width: 1,
          color: this.palette.snow,
          alpha: whirl.alpha,
        });
      }
    }
    // Rings lapping at the moored hull.
    for (let i = 0; i < 2; i += 1) {
      const t = (time * 0.3 + i * 0.5) % 1;
      g.ellipse(
        MOORED_BOAT.x,
        MOORED_BOAT.y + 6,
        20 + t * 16,
        4.5 + t * 3,
      ).stroke({
        width: 1,
        color: this.palette.snow,
        alpha: 0.15 * (1 - t),
      });
    }
  }

  // ------------------------------------------------------------------ water

  isWater(x: number, y: number): boolean {
    if (x <= this.shoreEdgeAt(y)) return false;
    if (
      x >= DOCK.x &&
      x <= DOCK.x + DOCK.width &&
      y >= DOCK.y &&
      y <= DOCK.bottom
    ) {
      return false;
    }
    return true;
  }
}
