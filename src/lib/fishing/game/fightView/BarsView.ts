import { FIGHT } from "../../config";
import { UI } from "../../ui/palette";
import { clamp } from "../../utils";
import { WarningView } from "./WarningView";

export abstract class BarsView extends WarningView {
  protected drawCue(): void {
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
  protected drawStamina(): void {
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
