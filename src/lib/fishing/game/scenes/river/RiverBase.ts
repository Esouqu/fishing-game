import { Container, Graphics } from "pixi.js";
import type { AssetBag } from "../../../assets";
import type { AreaDef, SceneLayout } from "../../../areas";
import { VIEW } from "../../../config";
import { clamp, randRange } from "../../../utils";
import { WaterSurface } from "../water";
import {
  FAR_BANK,
  NEAR_BANK,
  TREE_BODY,
  bankAt,
  noise,
  type BankTree,
  type Bubble,
  type Drift,
  type Ripple,
} from "./geometry";

export class RiverBase {
  readonly layout: SceneLayout;
  protected readonly area: AreaDef;
  protected readonly assets: AssetBag;
  /** Waterline y for every screen column; drawing and hit tests share them. */
  protected readonly farLine: Float32Array;
  protected readonly nearLine: Float32Array;
  protected readonly drifts: Drift[] = [];
  protected readonly bubbles: Bubble[] = [];
  protected readonly ripples: Ripple[] = [];
  /** Spruces on both banks, painted as sprites in `drawScenery`. */
  protected readonly bankTrees: BankTree[] = [];
  /** The half-drowned trunk in mid-channel, rocked by the current. */
  protected trunk: Container | null = null;
  protected trunkBaseX = 0;
  protected trunkBaseY = 0;
  /** Living surface: the current carries every crest downstream. */
  protected readonly water: WaterSurface;

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

  protected get palette() {
    return this.area.palette;
  }

  protected farAt(x: number): number {
    return this.farLine[Math.round(clamp(x, 0, VIEW.width))];
  }

  protected nearAt(x: number): number {
    return this.nearLine[Math.round(clamp(x, 0, VIEW.width))];
  }

  /** Downhill slope of the channel centreline; the current follows it. */
  protected flowSlope(x: number, dx = 8): number {
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
  protected buildTrees(): void {
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

  protected buildWaterMarks(): void {
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
  isWater(x: number, y: number): boolean {
    if (x < 0 || x > VIEW.width || y < 0 || y > VIEW.height) return false;
    const column = Math.round(x);
    return y > this.farLine[column] && y < this.nearLine[column];
  }

  protected traceEdge(g: Graphics, edge: (x: number) => number): void {
    g.moveTo(0, edge(0));
    for (let x = 2; x <= VIEW.width; x += 2) g.lineTo(x, edge(x));
  }

  protected rect(
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
