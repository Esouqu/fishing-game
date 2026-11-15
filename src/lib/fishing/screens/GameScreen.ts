import { Container, Graphics, Rectangle } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import type { Game } from "../Game";
import type { AreaDef } from "../areas";
import type { AreaId } from "../types";
import { VIEW } from "../config";
import { CURSORS } from "../cursors";
import { TEXT } from "../texts";
import { Screen } from "../ui/Screen";
import { AreaShortcuts } from "../ui/AreaShortcuts";
import { CastHint } from "../ui/CastHint";
import { CodexOverlay } from "../ui/CodexOverlay";
import { FloaterLayer } from "../ui/FloaterLayer";
import { GameHud } from "../ui/GameHud";
import { PauseMenu } from "../ui/PauseMenu";
import { WeatherForecast } from "../ui/WeatherForecast";
import { Atmosphere } from "../game/Atmosphere";
import { CastFlow } from "../game/CastFlow";
import { FightFocus } from "../game/FightFocus";
import { JuiceFx } from "../game/JuiceFx";
import { createFishingScene } from "../game/scenes";
import type { FishingScene } from "../game/scenes/FishingScene";

/**
 * Gameplay screen: composes the scene, HUD and overlays, routes raw input to
 * the cast flow and owns the pause/mute lifecycle. Round rules live in
 * {@link CastFlow}; HUD, pause menu, codex and feedback are separate widgets.
 */
export class GameScreen extends Screen {
  private readonly game: Game;
  private readonly area: AreaDef;
  private readonly scene: FishingScene;
  private readonly atmosphere = new Atmosphere();
  private readonly playfield = new Container();
  private readonly hud: GameHud;
  private readonly castHint: CastHint;
  private readonly fx = new Container();
  /** Fight UI that must stay legible in weather: the stamina bars. */
  private readonly fightHud = new Container();
  private readonly floaters = new FloaterLayer();
  private readonly bobberLayer = new Container();
  private readonly juice = new JuiceFx();
  private readonly focus = new FightFocus();
  private readonly inputCatcher: Graphics;
  private readonly flow: CastFlow;
  private readonly pauseMenu: PauseMenu;
  private readonly shortcuts: AreaShortcuts;
  /** Sky rail in the bottom centre: the next fronts and when they arrive. */
  private readonly forecast: WeatherForecast;
  /** Last availability pushed to the travel cards, to avoid redrawing them. */
  private shortcutsAvailable = true;
  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    this.flow.finalPull();
  };

  private paused = false;
  private codex: CodexOverlay | null = null;

  constructor(game: Game, area: AreaDef) {
    super();
    this.game = game;
    this.area = area;

    this.castHint = new CastHint(area.layout.hint.x, area.layout.hint.y);
    this.scene = createFishingScene(area, game.assets);
    this.addChild(this.playfield);
    this.playfield.addChild(this.scene);

    this.atmosphere.setMood(area.mood);
    this.atmosphere.setLight(
      area.layout.light?.x ?? null,
      area.layout.light?.y ?? null,
    );
    // Fog closes in on the water the angler is fishing, not just on his boots:
    // the clear pocket sits between him and the float band, so the float stays
    // readable while the rest of the lake disappears.
    const band = area.layout.bobber;
    const bandX = (band.minX + band.maxX) / 2;
    const bandY = band.centerY ?? (band.minY + band.maxY) / 2;
    // Biased towards the water (0.6 of the way) so the float and the fight stay
    // in the clear patch while the angler stays on its near edge.
    this.atmosphere.setFocus(
      area.layout.angler.x + (bandX - area.layout.angler.x) * 0.6,
      area.layout.angler.y + (bandY - area.layout.angler.y) * 0.6,
    );
    // Falling snow needs the waterline to ring on: the atmosphere asks the
    // scene, so a drop never splashes on the pier or the bank.
    this.atmosphere.setWaterTest((x, y) => this.scene.isWaterAt(x, y));
    const palette = game.clock.palette;
    const weatherDef = game.clock.weatherDefFor(area.id);
    this.scene.tint = palette.tint;
    this.scene.setLantern(palette.lantern);
    // The first frame shows the current cover, not a clear sky fading in.
    this.scene.snapCloudiness(weatherDef.cloud);
    this.atmosphere.setWorld(palette, weatherDef);

    // Purely visual layers (minigame frame) must never intercept pointer events
    // meant for the input catcher. The playfield is the only filtered layer;
    // HUD and floaters stay crisp above it.
    this.playfield.addChild(this.fx);
    this.fx.eventMode = "none";
    // The float is lifted above the minigame while the fight is active, so it
    // stays on top of the fish that carries it.
    this.playfield.addChild(this.bobberLayer);
    this.bobberLayer.eventMode = "none";
    // Weather goes last: fog and snow have to sit on top of the float, the line
    // and the hooked fish. Drawn above them the fight ring and the float stayed
    // crisp in thick fog, which looked pasted onto the scene instead of in it.
    this.playfield.addChild(this.atmosphere);
    // The fight darkens the lake, so it goes over the weather: fog only reaches
    // the edge of the clear patch instead of washing the spot out.
    this.playfield.addChild(this.focus);
    // The stamina bars are the one part of the fight that has to survive both
    // the weather and the darkening: a gauge the player reads to decide a tap
    // cannot be dimmed.
    this.playfield.addChild(this.fightHud);
    this.fightHud.eventMode = "none";
    this.juice.attachTo(this.playfield);

    this.flow = new CastFlow({
      game,
      area,
      scene: this.scene,
      juice: this.juice,
      floaters: this.floaters,
      fightLayer: this.fx,
      bobberLayer: this.bobberLayer,
      barsLayer: this.fightHud,
      focus: this.focus,
    });

    this.inputCatcher = new Graphics();
    this.inputCatcher.eventMode = "static";
    this.inputCatcher.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.inputCatcher.on("pointerdown", (event) => {
      this.trackPointer(event);
      this.flow.pointerDown(event.button, event.pointerType);
    });
    this.inputCatcher.on("pointermove", (event) => this.trackPointer(event));
    this.inputCatcher.on("globalpointermove", (event) =>
      this.trackPointer(event),
    );
    this.inputCatcher.on("pointerup", () => this.flow.pointerUp());
    this.inputCatcher.on("pointerupoutside", () => this.flow.pointerCancel());
    this.inputCatcher.on("pointercancel", () => this.flow.pointerCancel());
    this.addChild(this.inputCatcher);
    this.inputCatcher.cursor = CURSORS.default;

    this.hud = new GameHud(area, {
      onPause: () => this.openPause(),
    });
    this.hud.addChild(this.castHint);
    this.addChild(this.hud);

    // Travel cards: the other two water bodies, reachable in one click instead
    // of a trip through the pause menu and the picker.
    this.shortcuts = new AreaShortcuts(game, area.id, (areaId) => {
      this.switchArea(areaId);
    });
    this.addChild(this.shortcuts);

    // The forecast sits between the two travel cards: the corners say where
    // you can go, the middle says what the sky will do while you are there.
    this.forecast = new WeatherForecast(game, area.id);
    this.addChild(this.forecast);

    this.addChild(this.floaters);

    this.pauseMenu = new PauseMenu(game, {
      onResume: () => this.closePause(true),
      onCodex: () => this.openCodex(),
    });
    this.addChild(this.pauseMenu);

    this.game.app.canvas.addEventListener(
      "contextmenu",
      this.handleContextMenu,
    );
  }

  // ---------------------------------------------------------------- overlays

  private openPause(): void {
    if (this.paused) return;
    this.paused = true;
    this.flow.setPaused(true);
    // The round goes quiet under the panel: a lake bed, a reel or a landed
    // chime still ringing would keep playing behind a frozen picture.
    this.game.audio.setPaused(true);
    // The flow may have cancelled the charge; clear the meter immediately
    // instead of leaving the last frame frozen behind the pause overlay.
    this.hud.update(0, null);
    this.castHint.visible = false;
    this.inputCatcher.cursor = CURSORS.default;
    this.pauseMenu.open();
    // No click here: the HUD pause button is a Button and already plays one,
    // so cueing it again made every pause sound like a double press.
  }

  private closePause(silent = false): void {
    if (!this.paused) return;
    const hadCodex = this.codex !== null;
    this.closeCodex();
    this.paused = false;
    this.flow.setPaused(false);
    this.game.audio.setPaused(false);
    this.pauseMenu.close();
    if (!silent && !hadCodex) this.game.audio.back();
  }

  private openCodex(): void {
    if (!this.paused || this.codex) return;
    this.pauseMenu.blur();
    this.codex = new CodexOverlay(
      this.game,
      this.area.id,
      TEXT.codex.close,
      () => this.closeCodex(),
    );
    this.addChild(this.codex);
    // The pause menu's «справочник» entry is a Button and already plays the
    // click; a second one here read as a stutter.
  }

  private closeCodex(): void {
    if (!this.codex) return;
    this.codex.destroy({ children: true });
    this.codex = null;
    // The codex is the second entry (resume, codex, sound, menu).
    this.pauseMenu.focusAt(1);
  }

  /**
   * Travel card hit: drops the current round and starts a fresh one on the
   * picked water body. The round is closed, progress is flushed by `onExit`,
   * and the screen cross-fades.
   */
  private switchArea(areaId: AreaId): void {
    if (areaId === this.area.id) return;
    this.flow.setPaused(true);
    this.game.startGame(areaId);
  }

  // ------------------------------------------------------------------- input

  /** Cursor position in virtual screen units, not canvas pixels. */
  private trackPointer(event: FederatedPointerEvent): void {
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
  private isOverHud(x: number, y: number): boolean {
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

  private updateCastHint(dt: number): void {
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
   */
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
