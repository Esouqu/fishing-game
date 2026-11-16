import { Container } from "pixi.js";
import type { AssetBag } from "../../../assets";
import type { AreaDef, SceneLayout } from "../../../areas";
import { VIEW } from "../../../config";
import { randRange } from "../../../utils";
import { WaterSurface } from "../water";
import {
  DOCK,
  SHORE_X,
  type Glint,
  type Ripple,
  type WaterMark,
  type Whirl,
} from "./geometry";

export class CoveBase {
  readonly layout: SceneLayout;
  protected readonly area: AreaDef;
  protected readonly assets: AssetBag;
  protected readonly ripples: Ripple[] = [];
  protected readonly waterMarks: WaterMark[] = [];
  protected readonly whirls: Whirl[] = [];
  protected readonly glints: Glint[] = [];
  /** Boat hull, rocked around {@link MOORED_BOAT} every frame. */
  protected boat: Container | null = null;
  /** Living surface: the bay has the most wind of the three waters. */
  protected readonly water: WaterSurface;

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

  protected get palette() {
    return this.area.palette;
  }

  protected shoreEdgeAt(y: number): number {
    return SHORE_X + Math.sin(y * 0.065) * 3.2 + Math.sin(y * 0.17 + 1.7) * 1.6;
  }

  protected addWaterRipples(): void {
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
  protected addWaterMarks(): void {
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
