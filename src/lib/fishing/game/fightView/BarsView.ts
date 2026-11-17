import { FIGHT } from "../../config";
import { UI } from "../../ui/palette";
import { mixColor } from "../../world";
import { clamp } from "../../utils";
import { GAUGE } from "./setup";
import { WarningView } from "./WarningView";

/**
 * The player's stamina: a flat gauge lying over the water.
 *
 * It has been through both stages. First a plain 72×6 strip with a «СИЛА»
 * caption over it — interface furniture, not part of a fishing round. Then a
 * frosted glass tube with rounded ends, a lit liquid, a bright meniscus at the
 * level, frost pixels on the glass and a notch cut into the fill where the
 * reserve turns amber. The tube read as a different art style from everything
 * else in the scene (the bank, the pier and the pail are all hard pixel shapes),
 * and the marks sitting *inside* the fill broke the one reading that matters
 * mid-fight: how much is left.
 *
 * So: square corners, a 1px ink case, a flat liquid that fills from the left
 * with a hard edge, and state carried by the colour of the liquid and the rim.
 * The low-reserve threshold left the fill entirely — it is now a quiet tick
 * standing outside the left end of the gauge, the scale's own base mark.
 */

/** Inset of the liquid from the gauge's wall. */
const WALL = 1;
/** Gap between the gauge's left edge and the base mark outside it. */
const MARK_GAP = 4;
/** Height of that base mark; it overhangs the gauge by a pixel at each end. */
const MARK_OVERHANG = 1;

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

  /** The angler's stamina: a flat gauge filled from the left. */
  protected drawStamina(): void {
    const g = this.barG;
    const width = GAUGE.width;
    const height = GAUGE.height;
    const x = this.model.centerX - width / 2;
    const y = this.staminaY;
    const pulse = (Math.sin(this.model.time * 8) + 1) / 2;
    const value = clamp(this.model.gripValue);
    const locked = this.model.isGripLocked;
    const low = value <= FIGHT.lowGrip || locked;
    const liquid = locked ? UI.danger : low ? UI.amber : UI.ice;
    const rim = locked ? UI.rose : low ? UI.amber : UI.periwinkle;

    g.clear();

    // Dark halo, square like everything else: the gauge sits over open water,
    // and a bright bar with no shade behind it floated above the lake.
    g.rect(x - 2, y - 2, width + 4, height + 4).fill({
      color: UI.ink,
      alpha: 0.32,
    });

    // Ink case and glass. The glass is a shade above ink so the empty part of
    // the gauge still reads as a gauge rather than a hole in the water.
    g.rect(x - 1, y - 1, width + 2, height + 2).fill(UI.ink);
    g.rect(x, y, width, height).fill({
      color: mixColor(UI.ink, UI.periwinkle, 0.16),
      alpha: 0.92,
    });

    const inner = width - WALL * 2;
    const fill = Math.max(0, Math.round(inner * value));
    if (fill > 0) {
      // The reserve itself: one flat block. A highlight, a bottom shade or a
      // meniscus would each put a second edge inside the column the player is
      // reading, so the level is simply where the block stops.
      g.rect(x + WALL, y + WALL, fill, height - WALL * 2).fill(liquid);
    }

    // Base mark of the scale: a quiet tick standing outside the left end, where
    // the low-reserve threshold used to be cut into the fill.
    const markX = Math.round(x) - MARK_GAP;
    g.rect(markX, y - MARK_OVERHANG, 1, height + MARK_OVERHANG * 2).fill({
      color: rim,
      alpha: locked ? 0.55 + pulse * 0.45 : 0.6,
    });

    // The rim carries the state: periwinkle while there is reserve, amber at the
    // threshold, rose and pulsing once the grip is locked out.
    g.rect(x - 1, y - 1, width + 2, height + 2).stroke({
      width: 1,
      color: rim,
      alpha: locked ? 0.55 + pulse * 0.45 : 0.6,
    });
  }
}
