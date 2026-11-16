import { easeOutCubic, clamp } from "../../utils";
import { keycapWidth } from "../../ui/theme";
import { TEXT } from "../../texts";
import { BarsView } from "./BarsView";
import {
  FISH_SCALE,
  INTRO_DURATION,
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
    this.counterG.alpha = 1;
    this.ringG.alpha = 1;
    this.barG.y = 0;
    this.staminaLabel.visible = true;

    this.model.update(dt);
    if (!this.model.isRunning) return;
    this.draw();
    this.syncFishVisual();
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
    // Same pass as the sprite and the same point: the chip cannot inherit any
    // other motion from the scene.
    this.syncLandKey();
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
  }

  /**
   * The landing cue: a "ПКМ" chip over a tired fish while the final pull is
   * live. It is placed in the same pass as the fish sprite and from the same
   * point, so it rides the fish exactly — no float bob, no lag of its own.
   */
  private syncLandKey(): void {
    const landable = this.model.canLand;
    this.landKey.visible = landable;
    if (!landable) return;
    const point = this.model.fishPoint;
    const width = keycapWidth(TEXT.game.landKey, 5.5);
    this.landKey.position.set(
      Math.round(point.x - width / 2),
      Math.round(point.y - 23),
    );
  }
}
