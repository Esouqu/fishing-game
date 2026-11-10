import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { C, START_PROGRESS } from "../config";
import type { FishSpecies } from "../config";
import { chance, clamp, randRange } from "../utils";

export interface MinigameResult {
  won: boolean;
  perfect: boolean;
}

const WIDTH = 100;
const HEIGHT = 208;
const COL_X = 15;
const COL_Y = 17;
const COL_W = 60;
const COL_H = 174;
const PROG_X = 79;
const PROG_Y = 17;
const PROG_W = 8;
const PROG_H = 174;
const MAX_SLIPS = 2;

/**
 * Stardew-style reeling minigame: hold to lift the green zone, keep the fish
 * inside it, fill the progress bar before it drains.
 *
 * The panel is deliberately textless: a cream outer frame, a wooden inner
 * frame, a water column, and a gold progress channel in the right rail.
 */
export class Minigame extends Container {
  private readonly fish: FishSpecies;
  private readonly fishSprite: Sprite;
  private readonly ambientG = new Graphics();
  private readonly zoneG = new Graphics();
  private readonly progressG = new Graphics();

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
  private time = 0;
  private finishResult: MinigameResult | null = null;

  onFinish?: (result: MinigameResult) => void;

  constructor(fish: FishSpecies, icon: Texture) {
    super();
    this.fish = fish;

    this.addChild(this.buildFrame());
    this.addChild(this.ambientG);
    this.addChild(this.zoneG);

    this.fishSprite = new Sprite(icon);
    this.fishSprite.anchor.set(0.5);
    this.fishSprite.scale.set(1.45);
    this.fishSprite.scale.x *= -1;
    this.addChild(this.fishSprite);

    this.addChild(this.buildProgress());
    this.addChild(this.progressG);
    this.addChild(this.buildRod());

    this.zonePos = this.fishPos;
    this.update(0);
  }

  get result(): MinigameResult | null {
    return this.finishResult;
  }

  get fishSpecies(): FishSpecies {
    return this.fish;
  }

  /** Perfect slips still available, shown by the HUD pips. */
  get slipsLeft(): number {
    return Math.max(0, MAX_SLIPS - this.slips);
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

  // ------------------------------------------------------------------ layout

  private buildFrame(): Graphics {
    const g = new Graphics();

    // Soft drop shadow + cream outer shell.
    g.roundRect(2, 3, WIDTH, HEIGHT, 9).fill({
      color: C.ink,
      alpha: 0.35,
    });
    g.roundRect(0, 0, WIDTH, HEIGHT, 9).fill(C.cream);
    g.roundRect(0, 0, WIDTH, HEIGHT, 9).stroke({
      width: 1,
      color: C.ink,
      alignment: 0,
    });
    g.roundRect(1, 1, WIDTH - 2, HEIGHT - 2, 8).stroke({
      width: 1,
      color: C.white,
      alpha: 0.7,
      alignment: 0,
    });
    g.roundRect(2, 2, WIDTH - 4, HEIGHT - 4, 7).stroke({
      width: 1,
      color: C.steelPale,
      alpha: 0.5,
      alignment: 0,
    });

    // Wooden inner frame.
    g.rect(5, 5, 90, 198).fill(C.brown);
    g.rect(5, 5, 90, 198).stroke({ width: 1, color: C.ink, alignment: 0 });

    // Top rail.
    g.rect(5, 5, 90, 12).fill(C.brown);
    g.rect(6, 6, 88, 1).fill(C.brownLight);
    g.rect(5, 15, 90, 2).fill(C.brownDark);
    for (const x of [30, 55, 80]) g.rect(x, 5, 1, 12).fill(C.brownDark);

    // Bottom rail.
    g.rect(5, 191, 90, 12).fill(C.brown);
    g.rect(6, 192, 88, 1).fill({ color: C.brownLight, alpha: 0.7 });
    g.rect(5, 201, 90, 2).fill(C.brownDark);
    for (const x of [30, 55, 80]) g.rect(x, 191, 1, 12).fill(C.brownDark);

    // Left rail (the rod sits in this gutter).
    g.rect(5, 17, 10, 174).fill(C.brown);
    g.rect(5, 17, 1, 174).fill(C.brownDark);
    g.rect(14, 17, 1, 174).fill(C.brownDark);
    g.rect(6, 17, 1, 174).fill({ color: C.brownLight, alpha: 0.55 });

    // Right rail.
    g.rect(87, 17, 8, 174).fill(C.brown);
    g.rect(87, 17, 1, 174).fill(C.brownDark);
    g.rect(94, 17, 1, 174).fill(C.brownDark);
    g.rect(88, 17, 1, 174).fill({ color: C.brownLight, alpha: 0.4 });

    // Thin wooden separator between water and progress.
    g.rect(75, 17, 4, 174).fill(C.brown);
    g.rect(75, 17, 1, 174).fill(C.brownDark);
    g.rect(78, 17, 1, 174).fill(C.brownDark);

    // Plank seams.
    for (let y = 39; y < 190; y += 26) {
      g.rect(5, y, 10, 1).fill({ color: C.brownDark, alpha: 0.7 });
      g.rect(75, y, 4, 1).fill({ color: C.brownDark, alpha: 0.7 });
      g.rect(87, y, 8, 1).fill({ color: C.brownDark, alpha: 0.7 });
    }

    // Recessed water field.
    g.rect(COL_X - 1, COL_Y - 1, COL_W + 2, COL_H + 2).fill(C.ink);
    g.rect(COL_X, COL_Y, COL_W, COL_H).fill(C.ocean);
    g.rect(COL_X, COL_Y + COL_H * 0.34, COL_W, COL_H * 0.36).fill(C.deep);
    g.rect(COL_X, COL_Y + COL_H * 0.7, COL_W, COL_H * 0.3).fill(0x0d3f70);
    g.rect(COL_X, COL_Y, COL_W, 5).fill({ color: C.ink, alpha: 0.25 });
    g.rect(COL_X, COL_Y, 2, COL_H).fill({ color: C.ink, alpha: 0.18 });
    g.rect(COL_X + COL_W - 2, COL_Y, 2, COL_H).fill({
      color: C.ink,
      alpha: 0.18,
    });

    // Light shafts and a couple of weeds near the bottom.
    g.rect(COL_X + 12, COL_Y + 10, 1, COL_H - 24).fill({
      color: C.cream,
      alpha: 0.05,
    });
    g.rect(COL_X + 34, COL_Y + 6, 1, COL_H - 20).fill({
      color: C.cream,
      alpha: 0.04,
    });
    g.rect(COL_X + 47, COL_Y + 14, 1, COL_H - 28).fill({
      color: C.cream,
      alpha: 0.035,
    });
    g.rect(COL_X + 9, COL_Y + COL_H - 9, 1, 7).fill({
      color: C.greenDark,
      alpha: 0.75,
    });
    g.rect(COL_X + 12, COL_Y + COL_H - 7, 1, 5).fill({
      color: C.greenDark,
      alpha: 0.6,
    });
    g.rect(COL_X + 50, COL_Y + COL_H - 8, 1, 6).fill({
      color: C.greenDark,
      alpha: 0.65,
    });

    return g;
  }

  private buildProgress(): Graphics {
    const g = new Graphics();
    g.rect(PROG_X - 1, PROG_Y - 1, PROG_W + 2, PROG_H + 2).fill(C.ink);
    g.rect(PROG_X, PROG_Y, PROG_W, PROG_H).fill(0x1c2440);
    g.rect(PROG_X, PROG_Y, PROG_W, 2).fill({ color: C.ink, alpha: 0.55 });
    g.rect(PROG_X + 1, PROG_Y + 2, 1, PROG_H - 4).fill({
      color: C.steel,
      alpha: 0.18,
    });
    return g;
  }

  private buildRod(): Graphics {
    const g = new Graphics();
    // Steel rod running down the left gutter.
    g.rect(9, 22, 2, 160).fill(C.steelPale);
    g.rect(9, 22, 1, 160).fill(C.cream);
    g.rect(10, 22, 1, 160).fill({ color: C.ink, alpha: 0.45 });
    g.rect(8, 22, 4, 2).fill(C.ink);

    // Small wooden reel and crank at the bottom.
    g.circle(10, 184, 5).fill(C.brownLight);
    g.circle(10, 184, 5).stroke({ width: 1, color: C.ink, alignment: 0 });
    g.circle(10, 184, 2).fill(C.brownDark);
    g.rect(12, 182, 4, 2).fill(C.brownDark);
    g.rect(15, 180, 2, 4).fill(C.brownLight);
    g.rect(15, 180, 2, 1).fill(C.cream);
    return g;
  }

  // -------------------------------------------------------------------- draw

  private draw(overlap: boolean): void {
    this.drawAmbient();

    const zoneHeight = COL_H * this.fish.zone;
    const center = COL_Y + this.zonePos * COL_H;
    const top = clamp(
      center - zoneHeight / 2,
      COL_Y + 1,
      COL_Y + COL_H - zoneHeight - 1,
    );
    this.zoneG.clear();
    this.zoneG
      .rect(COL_X + 2, top, COL_W - 4, zoneHeight)
      .fill(overlap ? 0x7ed957 : C.green);
    this.zoneG
      .rect(COL_X + 2, top, COL_W - 4, zoneHeight)
      .stroke({ width: 1, color: C.greenDark, alignment: 0 });
    this.zoneG
      .rect(COL_X + 2, top, COL_W - 4, 1)
      .fill(overlap ? C.cream : C.yellow);
    this.zoneG
      .rect(COL_X + 2, top + zoneHeight - 1, COL_W - 4, 1)
      .fill({ color: C.greenDark, alpha: 0.9 });

    const fishY = clamp(
      COL_Y + this.fishPos * COL_H,
      COL_Y + 11,
      COL_Y + COL_H - 11,
    );
    this.fishSprite.position.set(COL_X + COL_W / 2, fishY);
    this.fishSprite.y += Math.sin(this.time * 8) * 0.6;

    const innerHeight = PROG_H - 2;
    const fillHeight = Math.max(0, innerHeight * this.progress);
    this.progressG.clear();
    if (fillHeight > 0) {
      const fillTop = PROG_Y + 1 + (innerHeight - fillHeight);
      this.progressG
        .rect(PROG_X + 1, fillTop, PROG_W - 2, fillHeight)
        .fill(C.gold);
      this.progressG.rect(PROG_X + 1, fillTop, PROG_W - 2, 1).fill(C.cream);
      this.progressG
        .rect(PROG_X + 1, fillTop, 1, fillHeight)
        .fill({ color: C.cream, alpha: 0.35 });
    }
  }

  private drawAmbient(): void {
    const g = this.ambientG;
    g.clear();
    for (let i = 0; i < 4; i += 1) {
      const speed = 0.045 + i * 0.012;
      const rise = (this.time * speed + i * 0.27) % 1;
      const x = COL_X + 8 + i * 13 + Math.sin(this.time * 1.4 + i * 2.1) * 1.6;
      const y = COL_Y + COL_H - 12 - rise * (COL_H - 34);
      const radius = i % 2 === 0 ? 1.5 : 1;
      g.circle(x, y, radius).fill({
        color: C.cream,
        alpha: 0.12 + (1 - rise) * 0.12,
      });
    }
  }

  private finish(won: boolean): void {
    if (!this.running) return;
    this.running = false;
    this.finishResult = { won, perfect: won && this.perfect };
    this.onFinish?.(this.finishResult);
  }
}
