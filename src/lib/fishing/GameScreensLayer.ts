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

export abstract class GameScreensLayer extends GameDevLayer {
  showMenu(): void {
    this.screens.show(new MenuScreen(this));
  }

  showHelp(): void {
    this.screens.show(new HelpScreen(this));
  }

  showAreas(origin: AreaPickOrigin = "menu"): void {
    // Cards and the backdrop both need the real stills; anything the idle
    // warm-up has not reached yet is rendered now, before the screen reads it.
    this.ensureAreaPreviews();
    this.screens.show(new AreaSelectScreen(this, origin));
  }

  showCodex(returnTo: CodexReturn = "menu"): void {
    this.screens.show(new CodexScreen(this, returnTo));
  }

  startGame(areaId?: AreaId): void {
    if (areaId && areaId !== this.areaId) {
      this.progress.setArea(areaId);
    }
    void this.progress.flush();
    this.screens.show(new GameScreen(this, this.area));
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
