import { Graphics } from "pixi.js";
import {
  COUNTER_ARROW_REACH,
  COUNTER_GRAB_ARC,
  COUNTER_GRAB_INNER,
  COUNTER_GRAB_OUTER,
} from "../fight/counter";
import { FIGHT_RADIUS } from "../fight";
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
    const pulse = (Math.sin(this.model.time * 3.2) + 1) / 2;
    const open = this.model.counterOpen;

    // One cone per direction, always drawn the same way: a filled band with a
    // thin outline. An honest dash gets one rose cone; a feint gets two — rose
    // for the heading it will really take, violet for the heading it pretends
    // to take — so the pair can be compared like two arrows of the same kind.
    if (open > 0) {
      const heading = this.model.counterHeading;
      this.drawGrabWedge(g, heading, pulse, 1);
      this.drawGrabRing(g, heading);
    } else if (this.model.warn > 0) {
      if (this.model.isFeint) {
        this.drawGrabWedge(g, this.model.counterHeading, pulse, 0.8);
        this.drawGrabWedge(g, this.model.warnHeading, pulse, 0.8, UI.violet);
      } else {
        this.drawGrabWedge(g, this.model.warnHeading, pulse, 0.8);
      }
    }

    // The cone alone carries the dash: it is drawn from the very arc the model
    // tests a press against, so it says where a grab lands without a pointer
    // drawn over it. The arrowheads that used to sit on the rim are gone — on a
    // feint the pair stacked two pointers of the same weight in the same band,
    // and the violet cone already says which heading is the lie.
  }

  /**
   * A cone of the ring: the side a press can come from.
   *
   * Drawn from the very constants the model tests against
   * ({@link COUNTER_GRAB_ARC} / `_INNER` / `_OUTER`), so the highlight *is* the
   * rule and not an illustration of it: a press anywhere in the rose cone is a
   * valid grab. It is a wash of water rather than a panel — the fish and the
   * float stay readable over it — but opaque enough to be found at a glance.
   *
   * Every cone is drawn with the same fill and stroke; the colour is the only
   * difference, so an honest dash and a feint read as the same object: rose is
   * a heading the fish will really take, violet is a lie.
   */
  protected drawGrabWedge(
    g: Graphics,
    heading: number,
    pulse: number,
    strength: number,
    color: number = UI.rose,
  ): void {
    const from = heading - COUNTER_GRAB_ARC;
    const to = heading + COUNTER_GRAB_ARC;
    const steps = 12;
    const at = (angle: number, radius: number): [number, number] => [
      this.model.centerX + Math.cos(angle) * radius,
      this.model.centerY + Math.sin(angle) * radius,
    ];

    const points: number[] = [];
    for (let i = 0; i <= steps; i += 1) {
      points.push(...at(from + ((to - from) * i) / steps, COUNTER_GRAB_OUTER));
    }
    for (let i = steps; i >= 0; i -= 1) {
      points.push(...at(from + ((to - from) * i) / steps, COUNTER_GRAB_INNER));
    }

    // The zone is a band of water the player presses through, so it stays a
    // wash rather than a panel — but at seven percent it was almost invisible
    // over the bright part of the ring, and the one cue the counter depends on
    // has to be read at a glance. The fill roughly doubled and the rim carries
    // the rest of the contrast.
    g.poly(points).fill({ color, alpha: (0.16 + pulse * 0.1) * strength });
    g.poly(points).stroke({
      width: 1,
      color,
      alpha: (0.5 + pulse * 0.3) * strength,
    });
  }

  /**
   * The grab window, marked by a small core on the arrow tip.
   *
   * It used to be a ring that breathed around that tip, then a shield opening
   * off the float. Both were a second circle in a frame that already carries the
   * fight ring, the telegraph cone and the fish's own arc; at the speed of a
   * counter that read as noise rather than as "press here". A dot is enough: the
   * cone says the side, the dot says the point.
   */
  protected drawGrabRing(g: Graphics, heading: number): void {
    const glow = (Math.sin(this.model.time * 12) + 1) / 2;
    const dotX = this.model.centerX + Math.cos(heading) * COUNTER_ARROW_REACH;
    const dotY = this.model.centerY + Math.sin(heading) * COUNTER_ARROW_REACH;
    g.circle(dotX, dotY, 3).fill({ color: UI.ice, alpha: 0.3 + glow * 0.5 });
  }

  protected drawCounterFlash(): void {
    const g = this.counterG;
    g.clear();

    if (this.model.counterFlashValue <= 0) {
      this.lockG.clear();
      return;
    }
    // A landed counter is one mark: the padlock on the fish. It says "this jerk
    // is cancelled" and sits where the jerk was. No shockwave rings — the fight
    // already draws its own ring, the float its waterline and the counter cone
    // flashes in the same instant, so every extra circle turned a clear "blocked"
    // into a burst of them.
    const lock = this.lockG;
    lock.clear();
    const point = this.model.fishPoint;
    const flash = clamp(this.model.counterFlashValue * 4);

    lock.ellipse(point.x, point.y + 1, 8, 5).fill({
      color: UI.ink,
      alpha: 0.45 * flash,
    });

    // Padlock: a dark body with a light shackle, drawn in whole pixels so it
    // stays crisp at the fight's own scale.
    const x = Math.round(point.x);
    const y = Math.round(point.y) - 4;
    lock.rect(x - 3, y, 6, 5).fill({ color: UI.ink, alpha: 0.9 * flash });
    lock.rect(x - 2, y + 1, 4, 3).fill({ color: UI.ice, alpha: 0.95 * flash });
    lock.rect(x - 1, y + 2, 2, 1).fill({ color: UI.ink, alpha: 0.95 * flash });
    lock
      .moveTo(x - 2, y)
      .lineTo(x - 2, y - 2)
      .lineTo(x + 1, y - 2)
      .lineTo(x + 1, y)
      .stroke({ width: 1, color: UI.ice, alpha: 0.95 * flash });
  }

  /**
   * Small arrow orbiting the float and pointing along the fish's velocity.
   *
   * It used to orbit the fish, which put the one "where is it going" cue on the
   * thing that is moving instead of on the thing the player is watching — the
   * float. The float leads the fish by a few pixels, so the arrow sits on the
   * water mark the player already tracks.
   */
  protected drawDirection(): void {
    const g = this.directionG;
    g.clear();
    const velocity = this.model.fishVelocity;
    const speed = Math.hypot(velocity.x, velocity.y);
    if (speed < 8) return;

    const angle = Math.atan2(velocity.y, velocity.x);
    const point = this.floatPoint;
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
