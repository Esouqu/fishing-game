import { Graphics } from "pixi.js";
import { FIGHT_RADIUS } from "../fight";
import { UI } from "../../ui/palette";
import { WINTER } from "../../world";
import { clamp } from "../../utils";
import { RING_SEGMENTS, ringRadiusAt } from "../fightRing";
import { MinigameCore } from "./MinigameCore";
import { TAU } from "./setup";

export abstract class RingView extends MinigameCore {
  protected waveRadius(
    angle: number,
    radius: number,
    line: number,
    time: number,
  ): number {
    return ringRadiusAt(angle, radius, line, time);
  }

  protected wavePoints(
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
  protected strokeArc(
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

  protected drawRing(): void {
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
}
