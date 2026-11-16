import { Application } from "pixi.js";
import { CURSORS } from "./cursors";
import { TEXT } from "./texts";
import { UI } from "./ui/palette";
import { GameScreensLayer } from "./GameScreensLayer";
import { setUiSoundHandler } from "./ui/Button";
import { normalizeOptions } from "./options";
import type { FishingGameInstance, FishingGameOptions } from "./types";

export class Game extends GameScreensLayer implements FishingGameInstance {
  static async create(options: FishingGameOptions): Promise<Game> {
    const normalized = normalizeOptions(options);
    const host = normalized.container;
    const width = Math.max(1, Math.floor(host.clientWidth));
    const height = Math.max(1, Math.floor(host.clientHeight));

    const app = new Application();
    await app.init({
      width,
      height,
      background: UI.night,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      roundPixels: true,
      preference: "webgl",
    });
    app.canvas.style.display = "block";
    app.canvas.style.touchAction = "none";
    app.canvas.style.outline = "none";
    app.canvas.style.cursor = CURSORS.default;
    app.canvas.tabIndex = 0;
    app.canvas.setAttribute("role", "application");
    app.canvas.setAttribute("aria-label", TEXT.common.ariaLabel);
    // Make the backdrop use the pixel cursor too, while controls above it keep
    // their own pointer/grab cursors.
    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.cursor = CURSORS.default;
    host.appendChild(app.canvas);

    const game = new Game(app, normalized);
    game.layout();
    await game.boot();
    return game;
  }

  // --------------------------------------------------------------- accessors
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.worldClock?.persist();
    void this.progressTracker?.flush();
    this.progressTracker?.dispose();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.resizeObserver.disconnect();
    this.app.canvas.removeEventListener("pointerdown", this.focusCanvas);
    this.app.canvas.removeEventListener("pointerenter", this.onPointerEnter);
    this.app.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.app.canvas.removeEventListener("pointermove", this.onCursorMove);
    this.app.canvas.classList.remove("cursor-hidden");
    this.cursorOverlay?.destroy({ children: true });
    this.cursorOverlay = null;
    if (this.audioPanel) {
      this.audioPanel.destroy({ children: true });
      this.audioPanel = null;
    }
    if (this.devPanel) {
      this.devPanel.destroy({ children: true });
      this.devPanel = null;
    }
    this.app.ticker.remove(this.tick);
    setUiSoundHandler(null);
    this.audioKit?.destroy();
    this.screens.destroy();
    if (this.bootLayer) {
      this.bootLayer.destroy({ children: true });
      this.bootLayer = null;
    }
    if (this.app.canvas.parentElement) {
      this.app.canvas.parentElement.removeChild(this.app.canvas);
    }
    this.app.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true },
    );
  }
}

export type { CodexReturn } from "./types";
