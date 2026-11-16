import { MenuScreen } from "./screens/MenuScreen";
import { HelpScreen } from "./screens/HelpScreen";
import {
  AreaSelectScreen,
  type AreaPickOrigin,
} from "./screens/AreaSelectScreen";
import { CodexScreen } from "./screens/CodexScreen";
import { GameScreen } from "./screens/GameScreen";

import type { AreaId, CatchEvent } from "./types";
import { GameDevLayer } from "./GameDevLayer";
import type { CodexReturn } from "./types";
import { VIEW } from "./config";
import type { WipePoint } from "./ui/GridWipe";

/** Where a change that did not come from a pointer starts its wipe. */
const CENTRE: WipePoint = { x: VIEW.width / 2, y: VIEW.height / 2 };

export abstract class GameScreensLayer extends GameDevLayer {
  showMenu(): void {
    const active = this.screens.active;
    // Leaving a round through the pause menu is a change of place as well: the
    // lake gives way to the title behind the same grid wave the travel cards
    // use, entering from the middle of the frame where the dialog sat.
    if (active instanceof GameScreen) {
      this.screens.show(new MenuScreen(this), "wipe", CENTRE);
      return;
    }
    // Coming back from a popup drops it off the bottom edge instead of
    // flashing the frame; the first screen still uses the plain dip.
    const back = active?.popup === true;
    this.screens.show(new MenuScreen(this), back ? "flyOut" : "fade");
  }

  showHelp(): void {
    this.screens.show(new HelpScreen(this), "flyIn");
  }

  showAreas(origin: AreaPickOrigin = "menu"): void {
    // Cards and the backdrop both need the real stills; anything the idle
    // warm-up has not reached yet is rendered now, before the screen reads it.
    this.ensureAreaPreviews();
    this.screens.show(new AreaSelectScreen(this, origin), "flyIn");
  }

  showCodex(returnTo: CodexReturn = "menu"): void {
    this.screens.show(new CodexScreen(this, returnTo), "flyIn");
  }

  /**
   * Starts a round. This is the one navigation that gets the grid wipe instead
   * of the flat dip: it either crosses to another water body (the travel cards
   * in the round, the picker's «к рыбалке») or hands the picker over to the
   * location the player chose.
   *
   * The wave always starts where the player clicked: a corner card passes its
   * own centre, the picker hands over from the middle of the frame. It is a
   * radial grid, never a flat wall, so the cells pop in one by one instead of
   * one edge crossing the frame.
   */
  startGame(areaId?: AreaId, origin: WipePoint = CENTRE): void {
    if (areaId && areaId !== this.areaId) {
      this.progress.setArea(areaId);
    }
    void this.progress.flush();
    this.screens.show(new GameScreen(this, this.area), "wipe", origin);
    this.devPanel?.refresh();
  }

  exit(): void {
    this.options.onExit?.();
  }
  restart(): void {
    this.startGame();
  }

  pause(): void {
    this.screens.onHostPause(true);
  }

  resume(): void {
    this.screens.onHostPause(false);
  }

  /** Host hook: forward a landed fish to the embedder. */
  handleCatch(event: CatchEvent): void {
    this.options.onCatch?.(event);
  }

  flushProgress(): Promise<void> {
    return this.progressTracker?.flush() ?? Promise.resolve();
  }
}
