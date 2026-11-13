import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import { C, FIGHT } from "../config";
import { WINTER } from "../world";
import type { FishSpecies } from "../config";
import { clamp, easeOutCubic } from "../utils";
import { makeText } from "../ui/theme";
import { TEXT } from "../texts";
import {
  FIGHT_RADIUS,
  FightModel,
  type MinigameOptions,
  type MinigameResult,
} from "./fightModel";

export type { MinigameOptions, MinigameResult } from "./fightModel";

const FISH_SCALE = 1;
const SILHOUETTE = 0x123e55;
const SILHOUETTE_WARN = 0x2a6480;
const TAU = Math.PI * 2;
const WAVE_SEGMENTS = 72;
const INTRO_DURATION = 0.42;

/**
 * Ring fight at the bobber: a thin view over {@link FightModel}. The model
 * owns every rule; this class only turns its state into water, foam and bars.
 */
export class Minigame extends Container {
  private readonly model: FightModel;
  private readonly fishSprite: Sprite;
  private readonly ringG = new Graphics();
  private readonly counterG = new Graphics();
  private readonly directionG = new Graphics();
  private readonly cueG = new Graphics();
  private readonly barG = new Graphics();
  private readonly gripG = new Graphics();
  private readonly warnG = new Graphics();
  private readonly counterLabel: Text;
  private intro = 0;
  private introScale = 0;

  onFinish?: (result: MinigameResult) => void;

  constructor(fish: FishSpecies, icon: Texture, options: MinigameOptions) {
    super();
    this.model = new FightModel(fish, options);
    this.eventMode = "none";

    this.addChild(this.ringG);

    this.fishSprite = new Sprite(icon);
    this.fishSprite.anchor.set(0.5);
    this.fishSprite.scale.set(FISH_SCALE);
    this.fishSprite.alpha = 0;
    this.fishSprite.tint = SILHOUETTE;
    this.addChild(this.fishSprite);
    this.addChild(this.counterG);

    this.counterLabel = makeText(TEXT.fight.counter, {
      size: 8,
      color: C.cyan,
      weight: 800,
      align: "center",
    });
    this.counterLabel.anchor.set(0.5, 1);
    this.counterLabel.style.stroke = { color: C.ink, width: 2 };
    this.counterLabel.visible = false;
    this.addChild(this.counterLabel);

    this.addChild(this.barG);
    this.addChild(this.gripG);
    this.addChild(this.directionG);
    this.addChild(this.cueG);
    this.addChild(this.warnG);
    this.model.onFinish = (result) => this.onFinish?.(result);
    this.update(0);
  }

  get result(): MinigameResult | null {
    return this.model.result;
  }

  get fishSpecies(): FishSpecies {
    return this.model.fish;
  }

  /** Perfect slips still available, shown by the HUD pips. */
  get slipsLeft(): number {
    return this.model.slipsLeft;
  }

  /** True while the player is actively steering; drives the reel sound. */
  get isSteering(): boolean {
    return this.model.isSteering;
  }

  /** Screen position of the fish silhouette, used by the trailing float. */
  get fishPoint(): { x: number; y: number } {
    return this.model.fishPoint;
  }

  /** Current fish velocity, used to trail the float behind the fish. */
  get fishVelocity(): { x: number; y: number } {
    return this.model.fishVelocity;
  }

  /** Anchor of the wavy ring, mostly for debugging and screenshots. */
  get ringCenter(): { x: number; y: number } {
    return { x: this.model.centerX, y: this.model.centerY };
  }

  /** True when the fish is tired and inside the circle. */
  get canLand(): boolean {
    return this.model.canLand;
  }

  /** 0..1 escape pressure; shown by the sinking float and taut line. */
  get escapeMeter(): number {
    return this.model.escapeMeter;
  }

  /** Top of the two-row stamina stack, just above the ring. */
  private get staminaY(): number {
    return this.model.centerY - FIGHT_RADIUS - 26;
  }

  /** Screen position of the tired fish, used as the touch landing target. */
  get landingTarget(): { x: number; y: number } | null {
    if (!this.canLand) return null;
    const point = this.model.fishPoint;
    return { x: point.x, y: point.y };
  }

  /** Hold to pull; release to rest. */
  setHold(held: boolean): void {
    this.model.setHold(held);
  }

  /** Separate final pull: RMB/F, or a tap on the fish. */
  finalPull(): void {
    this.model.finalPull();
  }

  /** Cursor position in screen space; while held it sets the pull direction. */
  setPointer(x: number | null, y: number | null): void {
    this.model.setPointer(x, y);
  }

  /** Optional keyboard steering direction (normalized by the caller). */
  setDirection(x: number, y: number): void {
    this.model.setDirection(x, y);
  }

  update(dt: number): void {
    if (!this.model.isRunning) return;

    // The entrance is visual only: the fight is fully interactive from the
    // first frame, so a stuck/lagging intro can never freeze the catch.
    if (this.intro < INTRO_DURATION) {
      this.intro = Math.min(INTRO_DURATION, this.intro + dt);
    }
    const introT = easeOutCubic(this.intro / INTRO_DURATION);
    this.introScale = 0.65 + 0.35 * introT;

    this.fishSprite.alpha = 0.82;
    this.barG.alpha = 1;
    this.gripG.alpha = 1;
    this.counterG.alpha = 1;
    this.ringG.alpha = 1;
    this.barG.y = 0;
    this.gripG.y = 0;

    this.model.update(dt);
    if (!this.model.isRunning) return;

    this.draw();
    this.syncFishVisual();
  }

  private syncFishVisual(): void {
    const point = this.model.fishPoint;
    const velocity = this.model.fishVelocity;
    this.fishSprite.position.set(point.x, point.y);
    this.fishSprite.rotation = clamp(velocity.x / 420, -0.45, 0.45);
    const face =
      velocity.x < -6
        ? -1
        : velocity.x > 6
          ? 1
          : this.fishSprite.scale.x < 0
            ? -1
            : 1;
    const grow = 0.82 + 0.18 * this.introScale;
    this.fishSprite.scale.set(face * FISH_SCALE * grow, FISH_SCALE * grow);
    this.fishSprite.tint = this.model.warn > 0 ? SILHOUETTE_WARN : SILHOUETTE;
  }

  // -------------------------------------------------------------------- draw

  private draw(): void {
    this.drawRing();
    this.drawCounterFlash();
    this.drawStamina();
    this.drawDirection();
    this.drawCue();
    this.drawWarning();
    this.updateCounterLabel();
  }

  private waveRadius(
    angle: number,
    radius: number,
    line: number,
    time: number,
  ): number {
    const primary = Math.sin(angle * (5 + line) + time * (0.8 + line * 0.17));
    const ripple = Math.sin(
      angle * (11 + line * 2) - time * (1.35 + line * 0.2),
    );
    return radius + primary * (1.6 + line * 0.35) + ripple * 0.7;
  }

  private wavePoints(
    radius: number,
    line: number,
    from = 0,
    to = TAU,
  ): number[] {
    const points: number[] = [];
    const steps = Math.max(8, Math.round((WAVE_SEGMENTS * (to - from)) / TAU));
    for (let i = 0; i <= steps; i += 1) {
      const angle = from + ((to - from) * i) / steps;
      const r = this.waveRadius(
        angle,
        radius * this.introScale,
        line,
        this.model.time,
      );
      points.push(
        this.model.centerX + Math.cos(angle) * r,
        this.model.centerY + Math.sin(angle) * r,
      );
    }
    return points;
  }

  private drawRing(): void {
    const g = this.ringG;
    const time = this.model.time;
    const pulse = (Math.sin(time * 3.2) + 1) / 2;
    const radius =
      Math.hypot(this.model.fishOffset.x, this.model.fishOffset.y) /
      FIGHT_RADIUS;
    const proximity = clamp((radius - 0.55) / 0.45, 0, 1);
    const introBoost = 1 - this.introScale;

    g.clear();

    // The ordinary boundary is barely there: it emerges only as the fish
    // approaches the rim, and never changes colour as a whole.
    const alpha = 0.06 + proximity * 0.16 + pulse * 0.03 + introBoost * 0.45;
    g.poly(this.wavePoints(FIGHT_RADIUS, 1)).stroke({
      width: 1.2,
      color: WINTER.snow,
      alpha,
    });
    g.poly(this.wavePoints(FIGHT_RADIUS - 3, 0)).stroke({
      width: 1,
      color: WINTER.snow,
      alpha: alpha * 0.35,
    });

    if (this.model.impactFlash > 0) {
      g.poly(this.wavePoints(FIGHT_RADIUS + 2, 1)).stroke({
        width: 1.5,
        color: WINTER.snow,
        alpha: this.model.impactFlash * 1.6,
      });
    }

    // Danger is local: a red arc only where the fish has broken the line,
    // plus a slim rim around the fish itself.
    if (this.model.isOutside) {
      const angle = this.model.fishAngle();
      g.poly(
        this.wavePoints(FIGHT_RADIUS, 1, angle - 0.55, angle + 0.55),
      ).stroke({
        width: 2,
        color: C.red,
        alpha: 0.5 + pulse * 0.3,
      });
      const point = this.model.fishPoint;
      g.circle(point.x, point.y, 9).stroke({
        width: 1.2,
        color: C.red,
        alpha: 0.3 + pulse * 0.2,
      });
    }
  }

  /** Drawn above the stamina stack so the pointer is never hidden by it. */
  private drawWarning(): void {
    const g = this.warnG;
    g.clear();
    if (this.model.warn <= 0 || this.intro < INTRO_DURATION) return;
    const pulse = (Math.sin(this.model.time * 3.2) + 1) / 2;
    this.drawWarningArrow(g, this.model.warnHeading, pulse);
  }

  /** A clear orange pointer: the fish is about to burst in this direction. */
  private drawWarningArrow(g: Graphics, angle: number, pulse: number): void {
    const cx = this.model.centerX;
    const cy = this.model.centerY;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const perpX = -sin;
    const perpY = cos;
    const flash = 0.6 + pulse * 0.4;

    // Short arc right at the rim, where the pointer meets the water.
    g.poly(
      this.wavePoints(FIGHT_RADIUS + 1, 1, angle - 0.45, angle + 0.45),
    ).stroke({
      width: 2,
      color: C.orange,
      alpha: 0.55 + pulse * 0.3,
    });

    for (let i = 0; i < 2; i += 1) {
      const tip = FIGHT_RADIUS + 6 + i * 6;
      const base = tip - 6;
      const half = 4.5 - i * 0.7;
      const tipX = cx + cos * tip;
      const tipY = cy + sin * tip;
      const baseAX = cx + cos * base + perpX * half;
      const baseAY = cy + sin * base + perpY * half;
      const baseBX = cx + cos * base - perpX * half;
      const baseBY = cy + sin * base - perpY * half;

      // Dark backing keeps the orange readable against the water.
      g.poly([
        tipX + cos * 1.5,
        tipY + sin * 1.5,
        baseAX + cos * 1,
        baseAY + sin * 1,
        baseBX + cos * 1,
        baseBY + sin * 1,
      ]).fill({ color: C.ink, alpha: 0.45 });
      g.poly([tipX, tipY, baseAX, baseAY, baseBX, baseBY]).fill({
        color: C.orange,
        alpha: flash,
      });
      const core = 0.3;
      g.poly([
        tipX - cos * 1.5,
        tipY - sin * 1.5,
        baseAX + (tipX - baseAX) * core,
        baseAY + (tipY - baseAY) * core,
        baseBX + (tipX - baseBX) * core,
        baseBY + (tipY - baseBY) * core,
      ]).fill({
        color: C.yellow,
        alpha: flash * 0.85,
      });
    }
  }

  private drawCounterFlash(): void {
    const g = this.counterG;
    g.clear();

    for (const bubble of this.model.bubbles) {
      const alpha = clamp(bubble.life / bubble.maxLife);
      g.circle(bubble.x, bubble.y, bubble.size).stroke({
        width: 1,
        color: C.cream,
        alpha: 0.65 * alpha,
      });
      g.circle(
        bubble.x - bubble.size * 0.3,
        bubble.y - bubble.size * 0.3,
        0.55,
      ).fill({ color: C.cyan, alpha: 0.7 * alpha });
    }

    if (this.model.counterFlashValue > 0) {
      const point = this.model.fishPoint;
      const progress = 1 - this.model.counterFlashValue / 0.6;
      g.circle(point.x, point.y, 5 + progress * 7).stroke({
        width: 1.5,
        color: C.cyan,
        alpha: this.model.counterFlashValue,
      });
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        g.moveTo(point.x + sx * 4, point.y + sy * 4)
          .lineTo(point.x + sx * 7, point.y + sy * 7)
          .stroke({
            width: 1,
            color: C.cyan,
            alpha: this.model.counterFlashValue * 0.9,
          });
      }
    }
  }

  private updateCounterLabel(): void {
    const flash = this.model.counterFlashValue;
    this.counterLabel.visible = flash > 0;
    if (flash <= 0) return;
    const point = this.model.fishPoint;
    this.counterLabel.position.set(point.x, point.y - 12);
    this.counterLabel.alpha = Math.min(1, flash * 2);
  }

  /** Small arrow orbiting the fish and pointing along its velocity. */
  private drawDirection(): void {
    const g = this.directionG;
    g.clear();
    const velocity = this.model.fishVelocity;
    const speed = Math.hypot(velocity.x, velocity.y);
    if (speed < 8) return;

    const angle = Math.atan2(velocity.y, velocity.x);
    const point = this.model.fishPoint;
    const x = point.x + Math.cos(angle) * 12;
    const y = point.y + Math.sin(angle) * 12;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const at = (lx: number, ly: number): [number, number] => [
      x + lx * cos - ly * sin,
      y + lx * sin + ly * cos,
    ];
    const triangle = [...at(3, 0), ...at(-2, -3), ...at(-2, 3)];

    g.poly(triangle).fill({ color: C.cream, alpha: 0.9 });
    g.poly(triangle).stroke({ width: 1, color: C.ink, alpha: 0.9 });
  }

  /** High-attention cue for the landing strike and the counter window. */
  private drawCue(): void {
    const g = this.cueG;
    g.clear();
    const pulse = (Math.sin(this.model.time * 6) + 1) / 2;

    if (this.model.canLand) {
      const point = this.model.fishPoint;
      g.circle(point.x, point.y, 17 + pulse * 2).stroke({
        width: 1.5,
        color: C.gold,
        alpha: 0.55 + pulse * 0.2,
      });
      return;
    }

    if (this.model.stunValue > 0) {
      const point = this.model.fishPoint;
      g.circle(point.x, point.y, 13 + pulse * 2).stroke({
        width: 1.5,
        color: C.cyan,
        alpha: 0.7,
      });
      g.circle(point.x, point.y, 19 + pulse * 3).stroke({
        width: 1,
        color: C.cyan,
        alpha: 0.3,
      });
    }
  }

  /** Fish endurance on top, the thinner angler grip directly below it. */
  private drawStamina(): void {
    const g = this.barG;
    const gg = this.gripG;
    const width = 62;
    const height = 6;
    const x = this.model.centerX - width / 2;
    const y = this.staminaY;
    const pulse = (Math.sin(this.model.time * 8) + 1) / 2;
    const value = clamp(this.model.enduranceValue);
    const low = value <= FIGHT.landThreshold;
    const color = low ? C.red : value <= 0.5 ? C.yellow : C.green;
    const border = this.model.isReady
      ? C.gold
      : this.model.isOutside
        ? C.red
        : this.model.warn > 0
          ? C.gold
          : C.brownDark;

    g.clear();
    g.rect(x - 1, y - 1, width + 2, height + 2).fill(C.ink);
    g.rect(x, y, width, height).fill({ color: C.ink, alpha: 0.55 });

    const fill = Math.max(0, Math.round(width * value));
    if (fill > 0) {
      g.rect(x, y, fill, height).fill(color);
      g.rect(x, y, fill, 1).fill({ color: C.cream, alpha: 0.55 });
    }

    // Landing threshold marker for the manual final pull.
    g.rect(x + width * FIGHT.landThreshold, y - 1, 1, height + 2).fill({
      color: C.cream,
      alpha: 0.55,
    });

    g.rect(x - 1, y - 1, width + 2, height + 2).stroke({
      width: 1,
      color: border,
      alpha: this.model.isReady ? 0.65 + pulse * 0.35 : 0.6,
    });

    // Grip: a thinner strip, deliberately under the endurance bar.
    const gy = y + 9;
    const gh = 3;
    const locked = this.model.isGripLocked;
    const advantage = this.model.hasAdvantage;
    const gripColor = locked ? C.red : advantage ? C.gold : C.cyan;

    gg.clear();
    gg.rect(x - 1, gy - 1, width + 2, gh + 2).fill(C.ink);
    gg.rect(x, gy, width, gh).fill({ color: C.ink, alpha: 0.6 });
    const gripFill = Math.round(width * clamp(this.model.gripValue));
    if (gripFill > 0) {
      gg.rect(x, gy, gripFill, gh).fill(gripColor);
      gg.rect(x, gy, gripFill, 1).fill({ color: C.cream, alpha: 0.5 });
    }
    gg.rect(x, gy, width, gh).stroke({
      width: 1,
      color: locked ? C.red : C.brownDark,
      alpha: locked ? 0.9 : 0.5,
    });
  }
}
