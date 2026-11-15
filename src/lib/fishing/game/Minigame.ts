import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import { FIGHT } from "../config";
import { WINTER, mixColor } from "../world";
import type { FishSpecies } from "../config";
import { clamp, easeOutCubic } from "../utils";
import { UI } from "../ui/palette";
import { makeText } from "../ui/theme";
import { TEXT } from "../texts";
import {
  FIGHT_RADIUS,
  FightModel,
  type MinigameOptions,
  type MinigameResult,
} from "./fightModel";
import { RING_SEGMENTS, ringRadiusAt } from "./fightRing";

export type { MinigameOptions, MinigameResult } from "./fightModel";

const FISH_SCALE = 1;
/**
 * The hooked fish is never shown in its own colours: through the water it is a
 * shadow, and the fight is about reading its motion, not its livery. The tint is
 * almost black rather than the old blue-teal, and the sprite sits below full
 * opacity so it stays a dark shape *in* the water instead of a sticker on top of
 * it — the red float and the warning arrow must remain the brightest things in
 * the ring.
 */
const SILHOUETTE = 0x05080b;
/** The warning only lifts the shadow to a cold slate; the arrow carries the cue. */
const SILHOUETTE_WARN = 0x1b2830;
/** Opacity of that shadow; low enough that the water reads through the fish. */
const SILHOUETTE_ALPHA = 0.55;
const TAU = Math.PI * 2;
const INTRO_DURATION = 0.42;
/** How far above the tired fish its "land it" mark hangs, in pixels. */
const LAND_MARK_LIFT = 17;

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
  /**
   * The landing-window mark: the same "!" the bite raises over the float.
   *
   * The landing cue used to be a closing ring around the fish. In a fight that
   * already draws a ring, two stamina bars and a heading arrow, one more circle
   * was the least legible way to say "act now" — and it arrived as a pulse
   * rather than as a point. The exclamation is the one symbol the round already
   * teaches the player (it is the bite), so the landing window reuses it.
   */
  private readonly landMark: Text;
  /**
   * The stamina stack, in a container of its own.
   *
   * It is deliberately **not** a child of the minigame: the fight layer sits
   * under the weather, so bars parented here were dimmed by the fog. The screen
   * parents this container above the fog instead; the drawing code still lives
   * here, and the bars are drawn in scene coordinates, so nothing else changes.
   */
  readonly bars = new Container();
  private intro = 0;
  private introScale = 0;
  /** 0..1 progress of the closing landing ring; 0 while it is not landable. */
  private landCue = 0;
  /** 0..1 opacity of the landing cue, so it can fade in and out on its own. */
  private landFade = 0;
  private wasLandable = false;

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
      color: UI.ice,
      weight: 800,
      align: "center",
    });
    this.counterLabel.anchor.set(0.5, 1);
    this.counterLabel.style.stroke = { color: UI.ink, width: 2 };
    this.counterLabel.visible = false;
    this.addChild(this.counterLabel);

    // Mint, not the bite's gold: the bite means "a fish is on", this one means
    // "it is spent, take it", and the mint is already the colour of the fish's
    // stamina running out on the bar above.
    this.landMark = makeText(TEXT.game.biteMark, {
      size: 22,
      color: UI.mint,
      weight: 800,
      align: "center",
    });
    this.landMark.anchor.set(0.5, 1);
    this.landMark.style.stroke = { color: UI.ink, width: 3 };
    this.landMark.visible = false;
    this.addChild(this.landMark);

    this.bars.addChild(this.barG);
    this.bars.addChild(this.gripG);
    this.bars.eventMode = "none";
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

    this.fishSprite.alpha = SILHOUETTE_ALPHA;
    this.barG.alpha = 1;
    this.gripG.alpha = 1;
    this.counterG.alpha = 1;
    this.ringG.alpha = 1;
    this.barG.y = 0;
    this.gripG.y = 0;

    this.model.update(dt);
    if (!this.model.isRunning) return;
    this.updateLandCue(dt);
    this.draw();
    this.syncFishVisual();
  }

  /**
   * The landing cue is a closing ring, so it needs a clock of its own: it starts
   * the moment the fish becomes landable, runs for {@link FIGHT.landCue}
   * seconds — the length of the `crit` chime that opens the window — and then
   * holds at full weight for as long as the window stays open.
   *
   * Visibility fades on its own clock, because the window can close again at any
   * moment (the fish shakes the hook loose or catches its breath). A ring that
   * blinked out of existence read as a dropped frame; it now fades in over a
   * beat and, when the chance is gone, fades out while opening up — the opposite
   * motion of the closing ring, so "the moment is slipping away" is legible.
   */
  private updateLandCue(dt: number): void {
    const landable = this.model.canLand;
    if (landable && !this.wasLandable) this.landCue = 0;
    this.wasLandable = landable;
    if (landable) {
      this.landCue = Math.min(1, this.landCue + dt / FIGHT.landCue);
    }

    const target = landable ? 1 : 0;
    // Fast in — the window is short — and slower out, so the eye can follow it.
    const rate = target > this.landFade ? 11 : 6;
    this.landFade += (target - this.landFade) * Math.min(1, dt * rate);
    if (this.landFade < 0.002) this.landFade = 0;
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
    this.updateLandMark();
  }

  /**
   * The "!" of the landing window, over the tired fish.
   *
   * It pops in at 1.25× and settles as the window opens, then breathes in
   * place exactly like the bite mark does over the float, so the two moments
   * of the round are one visual language.
   */
  private updateLandMark(): void {
    const mark = this.landMark;
    if (this.landFade <= 0.01) {
      mark.visible = false;
      return;
    }
    const point = this.model.fishPoint;
    const settle = easeOutCubic(this.landCue);
    const bounce = Math.abs(Math.sin(this.model.time * 6)) * 3;
    mark.visible = true;
    mark.position.set(point.x, point.y - LAND_MARK_LIFT - bounce);
    mark.scale.set(1.25 - 0.25 * settle);
    mark.alpha = this.landFade * (0.88 + 0.12 * (1 - settle));
  }

  private waveRadius(
    angle: number,
    radius: number,
    line: number,
    time: number,
  ): number {
    return ringRadiusAt(angle, radius, line, time);
  }

  private wavePoints(
    radius: number,
    line: number,
    from = 0,
    to = TAU,
  ): number[] {
    const points: number[] = [];
    const steps = Math.max(8, Math.round((RING_SEGMENTS * (to - from)) / TAU));
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

  /**
   * Stroke an arc fragment as an open path. `poly()` closes the path, so a
   * partial arc was drawn together with its chord and read as a lens.
   */
  private strokeArc(
    g: Graphics,
    radius: number,
    line: number,
    from: number,
    to: number,
    style: { width: number; color: number; alpha: number },
  ): void {
    const points = this.wavePoints(radius, line, from, to);
    g.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) {
      g.lineTo(points[i], points[i + 1]);
    }
    g.stroke(style);
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

    // No extra contour on impact. A dash used to flash a second wavy ring two
    // pixels outside the boundary, which read as the zone growing an outline
    // exactly when the player has to judge the rim — the one moment a second
    // circle is least welcome. The bolt is already announced by the orange
    // pointer, the frightened fish and the bubbles.

    // Danger is local: a red arc only where the fish has broken the line,
    // plus a slim rim around the fish itself.
    if (this.model.isOutside) {
      const angle = this.model.fishAngle();
      this.strokeArc(g, FIGHT_RADIUS, 1, angle - 0.55, angle + 0.55, {
        width: 2,
        color: UI.rose,
        alpha: 0.5 + pulse * 0.3,
      });
      const point = this.model.fishPoint;
      g.circle(point.x, point.y, 9).stroke({
        width: 1.2,
        color: UI.rose,
        alpha: 0.3 + pulse * 0.2,
      });
    }
  }

  /** Drawn above the stamina stack so the pointer is never hidden by it. */
  private drawWarning(): void {
    const g = this.warnG;
    g.clear();
    if (this.intro < INTRO_DURATION) return;
    // After a feint the false arrow is gone; a short amber arc marks where the
    // fish actually turned, so the reversal is readable instead of a teleport.
    if (this.model.turnFlash > 0) {
      this.strokeArc(
        g,
        FIGHT_RADIUS + 2,
        1,
        this.model.turnHeading - 0.35,
        this.model.turnHeading + 0.35,
        {
          width: 2,
          color: UI.amber,
          alpha: Math.min(1, this.model.turnFlash * 5),
        },
      );
    }
    if (this.model.warn <= 0) return;
    // The telegraphed heading. An honest dash is red; a feint is violet, so the
    // colour itself says "this one is lying to you" before the player has read
    // the arrow.
    if (this.model.isFeint) {
      // ...and under the false pointer, a barely-there red mark on the heading
      // the fish will really take. Dim enough that it does not cancel the trick
      // — a player who knows to look for it can learn to catch the turn.
      this.drawWarningArrow(
        g,
        this.model.counterHeading,
        (Math.sin(this.model.time * 3.2) + 1) / 2,
        {
          color: UI.rose,
          scale: 0.72,
          alpha: 0.2,
          rim: false,
        },
      );
    }
    const pulse = (Math.sin(this.model.time * 3.2) + 1) / 2;
    this.drawWarningArrow(g, this.model.warnHeading, pulse, {
      color: this.model.isFeint ? UI.violet : UI.rose,
    });
  }

  /** A clear pointer: the fish is about to burst in this direction. */
  private drawWarningArrow(
    g: Graphics,
    angle: number,
    pulse: number,
    style: {
      color: number;
      /** Hops of the pointer; 1 is the full-size cue. */
      scale?: number;
      /** Overall opacity, for the ghost hint of a feint's true heading. */
      alpha?: number;
      /** Whether the short arc at the rim is drawn. */
      rim?: boolean;
    },
  ): void {
    const cx = this.model.centerX;
    const cy = this.model.centerY;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const perpX = -sin;
    const perpY = cos;
    const scale = style.scale ?? 1;
    const alpha = style.alpha ?? 1;
    const flash = (0.6 + pulse * 0.4) * alpha;
    const core = mixColor(style.color, UI.text, 0.55);

    // Short arc right at the rim, where the pointer meets the water.
    if (style.rim !== false) {
      this.strokeArc(g, FIGHT_RADIUS + 1, 1, angle - 0.45, angle + 0.45, {
        width: 2,
        color: style.color,
        alpha: (0.55 + pulse * 0.3) * alpha,
      });
    }

    for (let i = 0; i < 2; i += 1) {
      const tip = FIGHT_RADIUS + (6 + i * 6) * scale;
      const base = tip - 6 * scale;
      const half = (4.5 - i * 0.7) * scale;
      const tipX = cx + cos * tip;
      const tipY = cy + sin * tip;
      const baseAX = cx + cos * base + perpX * half;
      const baseAY = cy + sin * base + perpY * half;
      const baseBX = cx + cos * base - perpX * half;
      const baseBY = cy + sin * base - perpY * half;

      // Dark backing keeps the pointer readable against the water.
      g.poly([
        tipX + cos * 1.5,
        tipY + sin * 1.5,
        baseAX + cos * 1,
        baseAY + sin * 1,
        baseBX + cos * 1,
        baseBY + sin * 1,
      ]).fill({ color: UI.ink, alpha: 0.45 * alpha });
      g.poly([tipX, tipY, baseAX, baseAY, baseBX, baseBY]).fill({
        color: style.color,
        alpha: flash,
      });
      const inner = 0.3;
      g.poly([
        tipX - cos * 1.5,
        tipY - sin * 1.5,
        baseAX + (tipX - baseAX) * inner,
        baseAY + (tipY - baseAY) * inner,
        baseBX + (tipX - baseBX) * inner,
        baseBY + (tipY - baseBY) * inner,
      ]).fill({
        color: core,
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
        color: UI.text,
        alpha: 0.65 * alpha,
      });
      g.circle(
        bubble.x - bubble.size * 0.3,
        bubble.y - bubble.size * 0.3,
        0.55,
      ).fill({ color: UI.ice, alpha: 0.7 * alpha });
    }

    if (this.model.counterFlashValue > 0) {
      const point = this.model.fishPoint;
      const progress = 1 - this.model.counterFlashValue / 0.6;
      g.circle(point.x, point.y, 5 + progress * 7).stroke({
        width: 1.5,
        color: UI.ice,
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
            color: UI.ice,
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

    g.poly(triangle).fill({ color: UI.text, alpha: 0.9 });
    g.poly(triangle).stroke({ width: 1, color: UI.ink, alpha: 0.9 });
  }

  /** High-attention cue for the landing strike and the counter window. */
  private drawCue(): void {
    const g = this.cueG;
    g.clear();
    const pulse = (Math.sin(this.model.time * 6) + 1) / 2;

    if (this.landFade > 0.01) {
      // The mark itself is a text laid over the fish; see `updateLandMark`.
      return;
    }

    if (this.model.stunValue > 0) {
      const point = this.model.fishPoint;
      g.circle(point.x, point.y, 13 + pulse * 2).stroke({
        width: 1.5,
        color: UI.ice,
        alpha: 0.7,
      });
      g.circle(point.x, point.y, 19 + pulse * 3).stroke({
        width: 1,
        color: UI.ice,
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
    const color = low ? UI.danger : value <= 0.5 ? UI.amber : UI.mint;
    const border = this.model.isReady
      ? UI.amber
      : this.model.isOutside
        ? UI.rose
        : this.model.warn > 0
          ? UI.amber
          : UI.periwinkle;

    g.clear();
    g.rect(x - 1, y - 1, width + 2, height + 2).fill(UI.ink);
    g.rect(x, y, width, height).fill({ color: UI.ink, alpha: 0.55 });

    const fill = Math.max(0, Math.round(width * value));
    if (fill > 0) {
      g.rect(x, y, fill, height).fill(color);
      g.rect(x, y, fill, 1).fill({ color: UI.text, alpha: 0.55 });
    }

    // Landing threshold marker for the manual final pull.
    g.rect(x + width * FIGHT.landThreshold, y - 1, 1, height + 2).fill({
      color: UI.text,
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
    const gripColor = locked ? UI.danger : advantage ? UI.amber : UI.ice;

    gg.clear();
    gg.rect(x - 1, gy - 1, width + 2, gh + 2).fill(UI.ink);
    gg.rect(x, gy, width, gh).fill({ color: UI.ink, alpha: 0.6 });
    const gripFill = Math.round(width * clamp(this.model.gripValue));
    if (gripFill > 0) {
      gg.rect(x, gy, gripFill, gh).fill(gripColor);
      gg.rect(x, gy, gripFill, 1).fill({ color: UI.text, alpha: 0.5 });
    }
    gg.rect(x, gy, width, gh).stroke({
      width: 1,
      color: locked ? UI.rose : UI.periwinkle,
      alpha: locked ? 0.9 : 0.5,
    });
  }
}
