import type { AreaId } from "../../types";
import type { FederatedPointerEvent } from "pixi.js";
import { CURSORS } from "../../cursors";
import { GameOverlays } from "./GameOverlays";

export class GameScreen extends GameOverlays {
  protected switchArea(areaId: AreaId): void {
    if (areaId === this.area.id) return;
    this.flow.setPaused(true);
    this.game.startGame(areaId);
  }

  // ------------------------------------------------------------------- input

  /** Cursor position in virtual screen units, not canvas pixels. */
  protected trackPointer(event: FederatedPointerEvent): void {
    const point = event.getLocalPosition(this);
    this.flow.setPointer(point.x, point.y);

    // Button/scrollbar targets own their own cursor. Only repaint the cursor
    // while the catcher itself is hovered, otherwise globalpointermove would
    // overwrite the custom pointer over UI controls.
    if (event.target !== this.inputCatcher) return;

    // The round has exactly one cursor: the dot. It used to switch back to the
    // menu arrow whenever the pointer left open water, which put a big pointer
    // in the middle of the river bank. Only the HUD and the pause menu are
    // allowed to show a different cursor.
    this.inputCatcher.cursor =
      this.paused || this.isOverHud(point.x, point.y)
        ? CURSORS.default
        : CURSORS.crosshair;
  }

  /**
   * True where the pointer must show the menu arrow instead of the fishing dot:
   * the HUD card and, while charging, the power bar. The cast prompt is *not*
   * here on purpose — it is a caption, not a control, and switching the cursor
   * over it looked like the label could be clicked.
   */
  protected isOverHud(x: number, y: number): boolean {
    if (this.shortcuts.hitTest(x, y)) return true;
    if (this.forecast.hitTest(x, y)) return true;
    return this.flow.phase === "charging" && this.hud.isOverPowerBar(x, y);
  }
  override handleKey(event: KeyboardEvent): boolean {
    if (this.codex) {
      return this.codex.handleKey(event);
    }
    if (this.paused) {
      if (event.code === "Escape") {
        this.closePause();
        return true;
      }
      if (event.code === "KeyC") {
        this.game.audio.click();
        this.openCodex();
        return true;
      }
      return this.pauseMenu.handleKey(event);
    }
    if (event.code === "Escape") {
      // Keyboard entries have no Button to play for them, so the click is
      // cued here instead of inside the openers (which the mouse already
      // covers and used to double).
      this.game.audio.click();
      this.openPause();
      return true;
    }
    if (event.code === "KeyC") {
      this.game.audio.click();
      this.openPause();
      this.openCodex();
      return true;
    }
    return this.flow.handleKeyDown(event);
  }

  override handleKeyUp(event: KeyboardEvent): void {
    this.flow.handleKeyUp(event);
  }

  // ----------------------------------------------------------------- update

  override update(dt: number): void {
    if (this.paused) return;

    const clock = this.game.clock;
    const changed = clock.update(dt);
    if (changed) clock.persist();
    const palette = clock.palette;
    const weatherDef = clock.weatherDefFor(this.area.id);
    // A new front brings its own air; the bed crossfades on the same frame the
    // sky starts to turn, so the ear and the eye agree about the weather.
    if (changed) this.game.audio.setWeather(weatherDef.id);
    this.scene.tint = palette.tint;
    this.scene.setLantern(palette.lantern);
    this.scene.setCloudiness(weatherDef.cloud);
    this.atmosphere.setWorld(palette, weatherDef);
    this.atmosphere.update(dt);

    this.scene.update(dt);
    this.juice.update(dt);
    this.updateCastHint(dt);
    this.floaters.update(dt);
    this.forecast.update();
    this.shortcuts.update(dt);

    this.flow.update(dt);
    this.hud.update(
      dt,
      this.flow.phase === "charging"
        ? { charge: this.flow.charge, luckCenter: this.flow.luckBandCenter }
        : null,
    );

    // The travel cards step aside for the fight: a corner click during the
    // landing window would drop the fish and the lake in one go.
    const available = this.flow.phase !== "fighting";
    if (available !== this.shortcutsAvailable) {
      this.shortcutsAvailable = available;
      this.shortcuts.setAvailable(available);
    }
  }

  protected updateCastHint(dt: number): void {
    const alpha = this.flow.castPromptAlpha;
    this.castHint.visible = alpha > 0;
    this.castHint.alpha = alpha;
    if (alpha > 0) this.castHint.tick(dt);
  }

  // --------------------------------------------------------------- lifecycle

  /**
   * The beds follow the visible screen, not the constructor: a screen is built
   * before the outgoing one is disposed, so starting the round's sound there
   * would be undone by the old screen's own exit.
  override onEnter(): void {
    this.game.audio.setAmbience(this.area.id);
    this.game.audio.setWeather(this.game.clock.weatherDefFor(this.area.id).id);
    // Fetch the cast/fight cues now, not on the first pointerdown: the round
    // starts in a second and `play` would otherwise wait on the network.
    this.game.audio.preloadRound();
  }

  override onHostPause(paused: boolean): void {
    if (paused) this.openPause();
    else this.closePause();
  }

  override onExit(): void {
    this.game.clock.persist();
    void this.game.flushProgress();
    // A round left through the pause menu must not leave the world bus ducked
    // for the menu that follows.
    this.game.audio.setPaused(false);
    // Menus keep the water bed but have no sky, so the weather bed leaves with
    // the round instead of howling over the title screen.
    this.game.audio.setWeather(null);
    this.inputCatcher.cursor = CURSORS.default;
    this.game.app.canvas.removeEventListener(
      "contextmenu",
      this.handleContextMenu,
    );
  }

  override onMuteChanged(): void {
    this.pauseMenu.refreshSound();
  }

  /**
   * The dev mixer (`F2`) has to hear what it is tuning: auditions of the cues
   * and of the ambience beds are made on the same bus the pause duck silences.
   * While the panel is up the duck is lifted; closing it restores the round's
   * own state, whatever that is by then.
   */
  override onAudioPanel(open: boolean): void {
    this.game.audio.setPaused(open ? false : this.paused);
  }

  /** Dev hook (`F3`): show a newly picked front without the 8 s blend. */
  snapWeather(): void {
    const def = this.game.clock.weatherDefFor(this.area.id);
    this.atmosphere.snapTo(def);
    this.scene.snapCloudiness(def.cloud);
  }
}
