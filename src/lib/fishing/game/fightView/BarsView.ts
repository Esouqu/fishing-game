import { FIGHT } from "../../config";
import { UI } from "../../ui/palette";
import { clamp } from "../../utils";
import { WarningView } from "./WarningView";

export abstract class BarsView extends WarningView {
  protected drawCue(): void {
    const g = this.cueG;
    g.clear();
    const pulse = (Math.sin(this.model.time * 6) + 1) / 2;

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

  /**
   * The angler's stamina, and only that: the fish's endurance moved down onto
   * the float, so the top of the frame now answers one question — how much pull
   * is left in the player. The bar is wider and captioned so it cannot be
   * mistaken for the fish's gauge; it turns amber below the low-grip mark and
   * the frame pulses when the grip is gone. The landing threshold tick lives on
   * the fish's arc, where it belongs.
   */
  protected drawStamina(): void {
    const g = this.barG;
    const width = 72;
    const height = 6;
    const x = this.model.centerX - width / 2;
    const y = this.staminaY;
    const pulse = (Math.sin(this.model.time * 8) + 1) / 2;
    const value = clamp(this.model.gripValue);
    const locked = this.model.isGripLocked;
    const low = value <= FIGHT.lowGrip || locked;
    const fillColor = locked ? UI.danger : low ? UI.amber : UI.ice;
    const edge = locked ? UI.rose : low ? UI.amber : UI.periwinkle;

    g.clear();
    g.rect(x - 1, y - 1, width + 2, height + 2).fill({
      color: UI.ink,
      alpha: 0.85,
    });
    g.rect(x, y, width, height).fill({ color: UI.ink, alpha: 0.55 });

    const fill = Math.max(0, Math.round(width * value));
    if (fill > 0) {
      g.rect(x, y, fill, height).fill(fillColor);
      g.rect(x, y, fill, 1).fill({ color: UI.text, alpha: 0.5 });
    }

    g.rect(x - 1, y - 1, width + 2, height + 2).stroke({
      width: 1,
      color: edge,
      alpha: locked ? 0.6 + pulse * 0.4 : 0.55,
    });

    this.staminaLabel.position.set(this.model.centerX, y - 3);
    this.staminaLabel.style.fill = locked
      ? UI.rose
      : low
        ? UI.amber
        : UI.textMuted;
  }
}
