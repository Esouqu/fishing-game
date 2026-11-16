import { Container, Graphics, Rectangle } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import type { GameContext } from "../../GameContext";
import type { AreaDef } from "../../areas";
import type { AreaId } from "../../types";
import { VIEW } from "../../config";
import { CURSORS } from "../../cursors";
import { Screen } from "../../ui/Screen";
import { AreaShortcuts } from "../../ui/AreaShortcuts";
import { CastHint } from "../../ui/CastHint";
import { CodexOverlay } from "../../ui/CodexOverlay";
import { FloaterLayer } from "../../ui/FloaterLayer";
import { GameHud } from "../../ui/GameHud";
import { PauseMenu } from "../../ui/PauseMenu";
import type { WipePoint } from "../../ui/GridWipe";
import { WeatherForecast } from "../../ui/WeatherForecast";
import { Atmosphere } from "../../game/Atmosphere";
import { CastFlow } from "../../game/CastFlow";
import { FightFocus } from "../../game/FightFocus";
import { JuiceFx } from "../../game/JuiceFx";
import { createFishingScene } from "../../game/scenes";
import type { FishingScene } from "../../game/scenes/FishingScene";

export abstract class GameScreenCore extends Screen {
  protected abstract trackPointer(event: FederatedPointerEvent): void;
  protected abstract closePause(silent?: boolean): void;
  protected readonly game: GameContext;
  protected readonly area: AreaDef;
  protected readonly scene: FishingScene;
  protected readonly atmosphere = new Atmosphere();
  protected readonly playfield = new Container();
  protected readonly hud: GameHud;
  protected readonly castHint: CastHint;
  protected readonly fx = new Container();
  /** Fight UI that must stay legible in weather: the stamina bars. */
  protected readonly fightHud = new Container();
  protected readonly floaters = new FloaterLayer();
  protected readonly bobberLayer = new Container();
  protected readonly juice = new JuiceFx();
  protected readonly focus = new FightFocus();
  protected readonly inputCatcher: Graphics;
  protected readonly flow: CastFlow;
  protected readonly pauseMenu: PauseMenu;
  protected readonly shortcuts: AreaShortcuts;
  /** Sky rail in the bottom centre: the next fronts and when they arrive. */
  protected readonly forecast: WeatherForecast;
  /** Last availability pushed to the travel cards, to avoid redrawing them. */
  protected shortcutsAvailable = true;
  protected readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    this.flow.finalPull();
  };

  protected paused = false;
  protected codex: CodexOverlay | null = null;

  constructor(game: GameContext, area: AreaDef) {
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
    this.shortcuts = new AreaShortcuts(game, area.id, (areaId, origin) => {
      this.switchArea(areaId, origin);
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

  protected abstract openPause(): void;
  protected abstract openCodex(): void;
  protected abstract switchArea(areaId: AreaId, origin: WipePoint): void;
}
