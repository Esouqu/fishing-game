import { easeOutCubic, clamp } from "../../utils";
import { FIGHT } from "../../config";
import { BarsView } from "./BarsView";
import {
  FISH_SCALE,
  INTRO_DURATION,
  LAND_MARK_LIFT,
  SILHOUETTE,
  SILHOUETTE_ALPHA,
  SILHOUETTE_WARN,
} from "./setup";

export class Minigame extends BarsView {
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
  protected updateLandCue(dt: number): void {
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

  protected syncFishVisual(): void {
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

  protected draw(): void {
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
  protected updateLandMark(): void {
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
}
