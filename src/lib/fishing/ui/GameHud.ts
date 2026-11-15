import { Container, Graphics } from "pixi.js";
import type { AreaDef } from "../areas";
import { LUCK_BAND, VIEW } from "../config";
import { Button } from "./Button";
import { UI } from "./palette";
import { SCREEN_INSET, drawFishGlyph, drawPauseIcon } from "./theme";

/** Live values of the cast power meter; `null` hides the meter. */
export interface PowerMeterState {
  charge: number;
  luckCenter: number;
}

export interface GameHudHandlers {
  onPause(): void;
}

/**
 * Cast power meter: the bar on its own, over the angler's head.
 *
 * It used to be a 148×26 plate with a "СИЛА" caption and a drop shadow. At that
 * size it covered the water the player is aiming at, and the caption was noise:
 * the bar only appears while the cast is being charged, so what it is needs no
 * label. Slimmer and narrower, it sits exactly where the "ready to cast" prompt
 * sits, so the eye stays on one spot above the angler.
 */
const POWER_BAR = { width: 60, height: 7 } as const;
/** Pixels above the angler's feet; matches the hint's line. */
const POWER_LIFT = 35;

const PAUSE_SIZE = 16;

/**
 * In-game HUD: the cast power meter over the angler and a bare pause control in
 * the top-right corner.
 *
 * It used to be two cards — weather plus the queued front on the left, the
 * clock and a pause control on the right. Both of those now have a better home:
 * the weather is a whole rail at the bottom of the frame (see
 * `WeatherForecast`), and the clock turned out to be decoration in a game that
 * runs on the player's own wall clock and never shows a deadline. A plate in
 * the corner held two pieces of information nobody was reading; the corner now
 * holds the one control that leaves the round.
 */
export class GameHud extends Container {
  private readonly powerBar = new Graphics();
  private readonly rareIcon = new Graphics();
  /** Left edge of the power bar, centred over the angler. */
  private readonly powerX: number;
  /** Top edge of the power bar, a little above the angler's hat. */
  private readonly powerY: number;
  private time = 0;

  constructor(area: AreaDef, handlers: GameHudHandlers) {
    super();
    this.powerX = Math.round(area.layout.angler.x - POWER_BAR.width / 2);
    this.powerY = Math.round(area.layout.angler.y - POWER_LIFT);

    // The pause control always shows its frame instead of appearing only under
    // the pointer: a button that is invisible until hovered reads as part of
    // the scenery and hides the one control that leaves the round.
    const pauseButton = new Button({
      width: PAUSE_SIZE,
      height: PAUSE_SIZE,
      variant: "secondary",
      icon: (g) => drawPauseIcon(g, UI.textOnBright),
      onClick: handlers.onPause,
    });
    pauseButton.position.set(
      VIEW.width - SCREEN_INSET - PAUSE_SIZE,
      SCREEN_INSET,
    );
    this.addChild(pauseButton);

    this.powerBar.position.set(this.powerX, this.powerY);
    this.powerBar.eventMode = "none";
    this.addChild(this.powerBar);

    drawFishGlyph(this.rareIcon, UI.mint);
    this.rareIcon.visible = false;
    this.rareIcon.eventMode = "none";
    this.addChild(this.rareIcon);
  }

  /** Per-frame refresh: the power meter, when the cast is being charged. */
  update(dt: number, power: PowerMeterState | null): void {
    this.time += dt;
    this.drawPower(power);
  }

  /** True inside the power meter, so the cursor can fall back to the arrow. */
  isOverPowerBar(x: number, y: number): boolean {
    return (
      x >= this.powerX - 1 &&
      x <= this.powerX + POWER_BAR.width + 1 &&
      y >= this.powerY - 1 &&
      y <= this.powerY + POWER_BAR.height + 1
    );
  }

  private drawPower(state: PowerMeterState | null): void {
    const g = this.powerBar;
    g.clear();
    if (!state) {
      this.rareIcon.visible = false;
      return;
    }

    const { width, height } = POWER_BAR;
    // The bar is drawn from its own origin; the container already sits over the
    // angler, so no absolute coordinates are involved.
    const charge = state.charge;
    g.rect(-1, -1, width + 2, height + 2).fill({ color: UI.ink, alpha: 0.85 });
    g.rect(0, 0, width, height).fill({ color: UI.panelAlt, alpha: 0.9 });
    const fill = Math.round(width * charge);
    g.rect(0, 0, fill, height).fill(UI.periwinkle);
    g.rect(0, 0, fill, 2).fill({ color: UI.text, alpha: 0.55 });
    g.rect(fill - 1, -1, 1, height + 2).fill(UI.text);

    // Luck zone: re-rolled every cast, so it has to be read live. Green matches
    // the manual; the little fish marks it as a rare-fish bonus.
    const bandW = Math.max(6, width * LUCK_BAND.width);
    const bandX = width * state.luckCenter - bandW / 2;
    const pulse = 0.55 + Math.abs(Math.sin(this.time * 3)) * 0.45;
    const inside = Math.abs(charge - state.luckCenter) <= LUCK_BAND.width / 2;
    g.rect(bandX - 2, -3, bandW + 4, height + 6).fill({
      color: UI.mint,
      alpha: (inside ? 0.34 : 0.14) * pulse,
    });
    g.rect(bandX, 0, bandW, height).fill({
      color: UI.mint,
      alpha: inside ? 0.9 : 0.66,
    });
    g.rect(bandX, 0, 1, height).fill({ color: UI.text, alpha: 0.95 });
    g.rect(bandX + bandW - 1, 0, 1, height).fill({
      color: UI.text,
      alpha: 0.95,
    });

    this.rareIcon.visible = true;
    this.rareIcon.position.set(
      Math.min(
        this.powerX + width - 13,
        Math.max(this.powerX, this.powerX + bandX + bandW / 2 - 6.5),
      ),
      this.powerY - 10,
    );
    this.rareIcon.alpha = 0.78 + pulse * 0.22;
  }
}
