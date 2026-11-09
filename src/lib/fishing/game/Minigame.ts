import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import { C, START_PROGRESS } from "../config";
import type { FishSpecies } from "../config";
import { chance, clamp, randRange } from "../utils";
import { drawPanel, makeText } from "../ui/theme";

export interface MinigameResult {
  won: boolean;
  perfect: boolean;
}

const WIDTH = 114;
const HEIGHT = 190;
const COL_X = 12;
const COL_Y = 27;
const COL_W = 40;
const COL_H = 132;
const PROG_X = 66;
const PROG_W = 12;
const MAX_SLIPS = 2;

/**
 * Stardew-style reeling minigame: hold to lift the green zone, keep the fish
 * inside it, fill the progress bar before it drains.
 */
export class Minigame extends Container {
  private readonly fish: FishSpecies;
  private readonly fishSprite: Sprite;
  private readonly zoneG = new Graphics();
  private readonly progressG = new Graphics();
  private readonly hint: Text;

  private fishPos = 0.5;
  private fishVel = 0;
  private fishTarget = 0.5;
  private retarget = 0.5;

  private zonePos = 0.65;
  private zoneVel = 0;

  private progress = START_PROGRESS;
  private hold = false;
  private running = true;
  private perfect = true;
  private slips = 0;
  private wasOverlapping = true;
  private readonly pipsG = new Graphics();
  private time = 0;
  private finishResult: MinigameResult | null = null;

  onFinish?: (result: MinigameResult) => void;

  constructor(fish: FishSpecies, icon: Texture) {
    super();
    this.fish = fish;

    const g = new Graphics();
    drawPanel(g, 0, 0, WIDTH, HEIGHT, { shadow: true, fill: C.panel });
    g.rect(0, 0, WIDTH, 20).fill(C.ink);
    g.rect(0, 20, WIDTH, 1).fill({ color: C.steel, alpha: 0.6 });
    this.addChild(g);

    const title = makeText(fish.name, {
      size: 10,
      color: C.gold,
      weight: 700,
      align: "center",
    });
    title.position.set(WIDTH / 2, 5);
    this.addChild(title);
    this.addChild(this.pipsG);

    const columnBg = new Graphics();
    columnBg.rect(COL_X, COL_Y, COL_W, COL_H).fill(0x1c2440);
    columnBg
      .rect(COL_X, COL_Y, COL_W, COL_H)
      .stroke({ width: 1, color: C.ink, alignment: 0 });
    for (let i = 1; i < 4; i += 1) {
      columnBg
        .rect(COL_X + 1, COL_Y + (COL_H / 4) * i, COL_W - 2, 1)
        .fill({ color: C.steel, alpha: 0.16 });
    }
    this.addChild(columnBg);

    this.zonePos = this.fishPos;
    this.addChild(this.zoneG);

    this.fishSprite = new Sprite(icon);
    this.fishSprite.anchor.set(0.5);
    this.fishSprite.scale.set(1.6);
    this.fishSprite.scale.x *= -1;
    this.addChild(this.fishSprite);

    const progressBg = new Graphics();
    progressBg.rect(PROG_X, COL_Y, PROG_W, COL_H).fill(0x1c2440);
    progressBg
      .rect(PROG_X, COL_Y, PROG_W, COL_H)
      .stroke({ width: 1, color: C.ink, alignment: 0 });
    this.addChild(progressBg);
    this.addChild(this.progressG);

    const progressLabel = makeText("ПРОГРЕСС", {
      size: 7,
      color: C.steelPale,
      align: "center",
    });
    progressLabel.position.set(PROG_X + PROG_W / 2, COL_Y + COL_H + 4);
    this.addChild(progressLabel);

    this.hint = makeText("ДЕРЖИ", {
      size: 8,
      color: C.steelPale,
      weight: 600,
      align: "center",
    });
    this.hint.position.set(WIDTH / 2, HEIGHT - 14);
    this.addChild(this.hint);

    const points = makeText(`+${fish.points}`, {
      size: 8,
      color: C.yellow,
    });
    points.position.set(6, 5);
    this.addChild(points);

    this.update(0);
  }

  get result(): MinigameResult | null {
    return this.finishResult;
  }

  get fishSpecies(): FishSpecies {
    return this.fish;
  }

  setHold(hold: boolean): void {
    this.hold = hold;
  }

  update(dt: number): void {
    if (!this.running) return;
    this.time += dt;
    dt = Math.min(dt, 0.05);

    // Fish movement: springy target chasing with occasional darts.
    this.retarget -= dt;
    if (this.retarget <= 0) {
      const dart = chance(0.14);
      this.fishTarget = dart
        ? Math.random() > 0.5
          ? randRange(0.78, 1.05)
          : randRange(-0.05, 0.22)
        : randRange(-0.05, 1.05);
      this.retarget = randRange(0.35, 1.1) - this.fish.speed * 0.14;
    }
    const stiffness = 8 + this.fish.speed * 30;
    this.fishVel += (this.fishTarget - this.fishPos) * stiffness * dt;
    this.fishVel *= Math.max(0, 1 - (5 + this.fish.speed * 5) * dt);
    this.fishPos += this.fishVel * dt;
    if (this.fishPos < 0.02) {
      this.fishPos = 0.02;
      this.fishVel = Math.abs(this.fishVel) * 0.35;
    } else if (this.fishPos > 0.98) {
      this.fishPos = 0.98;
      this.fishVel = -Math.abs(this.fishVel) * 0.35;
    }

    // Green zone movement.
    this.zoneVel += (this.hold ? -2.7 : 1.2) * dt;
    this.zoneVel *= Math.max(0, 1 - 5.2 * dt);
    this.zonePos += this.zoneVel * dt;
    const half = this.fish.zone / 2;
    if (this.zonePos < half) {
      this.zonePos = half;
      this.zoneVel = Math.max(0, this.zoneVel);
    } else if (this.zonePos > 1 - half) {
      this.zonePos = 1 - half;
      this.zoneVel = Math.min(0, this.zoneVel);
    }

    const overlap = Math.abs(this.fishPos - this.zonePos) <= half + 0.055;
    if (this.wasOverlapping && !overlap) {
      this.slips = Math.min(MAX_SLIPS, this.slips + 1);
      if (this.slips >= MAX_SLIPS) this.perfect = false;
    }
    this.wasOverlapping = overlap;
    this.progress += (overlap ? 0.4 : -this.fish.drain) * dt;
    this.progress = clamp(this.progress);

    this.draw(overlap);

    if (this.progress >= 1) this.finish(true);
    else if (this.progress <= 0) this.finish(false);
  }

  private draw(overlap: boolean): void {
    const zoneHeight = COL_H * this.fish.zone;
    const center = COL_Y + this.zonePos * COL_H;
    const top = clamp(
      center - zoneHeight / 2,
      COL_Y,
      COL_Y + COL_H - zoneHeight,
    );
    this.zoneG.clear();
    this.zoneG
      .rect(COL_X + 1, top, COL_W - 2, zoneHeight)
      .fill({ color: overlap ? C.green : C.greenDark, alpha: 0.85 });
    this.zoneG
      .rect(COL_X + 1, top, COL_W - 2, 2)
      .fill({ color: C.yellow, alpha: overlap ? 0.85 : 0.45 });
    this.zoneG
      .rect(COL_X + 1, top + zoneHeight - 2, COL_W - 2, 2)
      .fill({ color: C.ink, alpha: 0.35 });

    const fishY = clamp(
      COL_Y + this.fishPos * COL_H,
      COL_Y + 11,
      COL_Y + COL_H - 11,
    );
    this.fishSprite.position.set(COL_X + COL_W / 2, fishY);
    this.fishSprite.y += Math.sin(this.time * 8) * 0.6;

    const innerHeight = COL_H - 2;
    const fillHeight = Math.max(0, innerHeight * this.progress);
    const color =
      this.progress > 0.66 ? C.green : this.progress > 0.33 ? C.gold : C.orange;
    this.progressG.clear();
    this.progressG
      .rect(
        PROG_X + 1,
        COL_Y + 1 + (innerHeight - fillHeight),
        PROG_W - 2,
        fillHeight,
      )
      .fill({ color, alpha: 0.95 });
    this.progressG
      .rect(PROG_X + 1, COL_Y + 1 + (innerHeight - fillHeight), PROG_W - 2, 1)
      .fill({ color: C.cream, alpha: 0.8 });

    this.drawPips();

    this.hint.text = this.perfect ? "УДЕРЖИВАЙ · ЧИСТО" : "УДЕРЖИВАЙ";
    this.hint.alpha = overlap ? 0.9 : 0.55;
  }

  private drawPips(): void {
    const g = this.pipsG;
    g.clear();
    const remaining = Math.max(0, MAX_SLIPS - this.slips);
    for (let i = 0; i < MAX_SLIPS; i += 1) {
      const x = WIDTH - 17 + i * 8;
      const y = 7;
      g.rect(x, y, 6, 6).fill({ color: C.ink, alpha: 0.8 });
      if (i < remaining) {
        g.rect(x + 1, y + 1, 4, 4).fill(C.cyan);
        g.rect(x + 1, y + 1, 4, 1).fill({ color: C.cream, alpha: 0.8 });
      } else {
        g.rect(x + 1, y + 1, 4, 4).fill({ color: C.steel, alpha: 0.35 });
      }
    }
  }

  private finish(won: boolean): void {
    if (!this.running) return;
    this.running = false;
    this.finishResult = { won, perfect: won && this.perfect };
    this.onFinish?.(this.finishResult);
  }
}
