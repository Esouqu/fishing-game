import { Graphics } from "pixi.js";
import { FIGHT_RADIUS } from "../fight";
import { mixColor } from "../../world";
import { UI } from "../../ui/palette";
import { clamp } from "../../utils";
import { RingView } from "./RingView";
import { INTRO_DURATION } from "./setup";

export abstract class WarningView extends RingView {
  protected drawWarning(): void {
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
  protected drawWarningArrow(
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

  protected drawCounterFlash(): void {
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

  protected updateCounterLabel(): void {
    const flash = this.model.counterFlashValue;
    this.counterLabel.visible = flash > 0;
    if (flash <= 0) return;
    const point = this.model.fishPoint;
    this.counterLabel.position.set(point.x, point.y - 12);
    this.counterLabel.alpha = Math.min(1, flash * 2);
  }

  /** Small arrow orbiting the fish and pointing along its velocity. */
  protected drawDirection(): void {
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
}
