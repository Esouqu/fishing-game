import { Application, Container, Graphics, Texture } from "pixi.js";
import type { AreaDef } from "./areas";
import { AREA_BY_ID, DEFAULT_AREA_ID } from "./areas";
import { setUiSoundHandler } from "./ui/Button";
import { CursorOverlay } from "./ui/CursorOverlay";
import { AudioMixPanel } from "./ui/AudioMixPanel";
import { DevWeatherPanel } from "./ui/DevWeatherPanel";
import { ScreenManager } from "./ui/ScreenManager";
import { ProgressTracker } from "./progress";
import type { SettingsStore } from "./storage";
import type { WorldClock } from "./world";
import type { AudioKit } from "./audio";
import type { AssetBag } from "./assets";
import type { AreaId, NormalizedOptions } from "./types";
import { VIEW } from "./config";

export abstract class GameBase {
  readonly app: Application;
  readonly options: NormalizedOptions;
  readonly screens = new ScreenManager();
  readonly world = new Container();

  protected assetBag: AssetBag | null = null;
  protected audioKit: AudioKit | null = null;
  protected settingsStore: SettingsStore | null = null;
  protected worldClock: WorldClock | null = null;
  protected progressTracker: ProgressTracker | null = null;
  protected readonly previews: Partial<Record<AreaId, Texture>> = {};
  /** Gradient stand-ins for previews that are not rendered yet. */
  protected readonly fallbackPreviews = new Map<AreaId, Texture>();

  protected bootLayer: Container | null = null;
  protected bootFill: Graphics | null = null;
  protected cursorOverlay: CursorOverlay | null = null;
  protected cursorX = 0;
  protected cursorY = 0;
  /** Dev audio balance panel, built the first time it is opened. */
  protected audioPanel: AudioMixPanel | null = null;
  /** Dev weather picker, built the first time it is opened. */
  protected devPanel: DevWeatherPanel | null = null;

  /** Clips all game content to the 480×270 frame inside the letterbox. */
  protected readonly worldMask = new Graphics();

  protected destroyed = false;
  protected pointerInside = false;
  protected readonly resizeObserver: ResizeObserver;
  protected readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed || !this.isEngaged() || this.assetBag === null) return;
    // The audio mixer and the weather picker are authoring tools, not cheats
    // for the shipped game: in a production build they do nothing.
    if (event.code === "F2" || event.code === "F3") {
      if (!import.meta.env.DEV) return;
      event.preventDefault();
      if (event.code === "F2") this.toggleAudioPanel();
      else this.toggleDevPanel();
      return;
    }
    if (this.audioPanel?.isOpen) {
      // The panel owns the keyboard while it is up: no cast, no pause menu.
      this.audioPanel.handleKey(event);
      event.preventDefault();
      return;
    }
    if (this.devPanel?.handleKey(event)) {
      event.preventDefault();
      return;
    }
    if (
      event.code === "Space" ||
      event.code === "ArrowUp" ||
      event.code === "ArrowDown" ||
      event.code === "ArrowLeft" ||
      event.code === "ArrowRight"
    ) {
      event.preventDefault();
    }
    this.screens.handleKey(event);
  };

  protected readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.destroyed || !this.isEngaged() || this.assetBag === null) return;
    this.screens.handleKeyUp(event);
  };

  protected readonly onWheel = (event: WheelEvent): void => {
    if (this.destroyed || !this.isEngaged() || this.assetBag === null) return;
    const handled = this.screens.active?.handleWheel(event) ?? false;
    if (handled) event.preventDefault();
  };

  protected readonly onVisibility = (): void => {
    if (this.destroyed) return;
    // Leaving the tab pauses the round; coming back does NOT resume it. The
    // player left mid-fight, so the game waits for a deliberate «продолжить»
    // instead of dropping them back into a landing window they cannot see.
    if (!document.hidden) return;
    this.worldClock?.persist();
    void this.progressTracker?.flush();
    this.screens.onHostPause(true);
  };

  protected constructor(app: Application, options: NormalizedOptions) {
    this.app = app;
    this.options = options;
    this.world.eventMode = "static";
    this.app.stage.addChild(this.world);

    // The canvas fills the host and the world is letterboxed inside it. A mask
    // keeps snow, particles and oversized scenery from leaking into the bars.
    this.worldMask.rect(0, 0, VIEW.width, VIEW.height).fill(0xffffff);
    this.worldMask.eventMode = "none";
    this.app.stage.addChild(this.worldMask);
    this.world.mask = this.worldMask;

    this.resizeObserver = new ResizeObserver(() => this.applyResize());
    this.resizeObserver.observe(options.container);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    document.addEventListener("visibilitychange", this.onVisibility);
    app.canvas.addEventListener("pointerdown", this.focusCanvas);
    app.canvas.addEventListener("pointerenter", this.onPointerEnter);
    app.canvas.addEventListener("pointerleave", this.onPointerLeave);
    app.canvas.addEventListener("pointermove", this.onCursorMove);
    app.ticker.add(this.tick);

    setUiSoundHandler((kind) => {
      if (!this.audioKit) return;
      if (kind === "click") this.audioKit.click();
      else this.audioKit.hover();
    });
  }
  get assets(): AssetBag {
    if (!this.assetBag) throw new Error("[fishing] assets are not loaded yet");
    return this.assetBag;
  }

  get audio(): AudioKit {
    if (!this.audioKit) throw new Error("[fishing] audio is not ready yet");
    return this.audioKit;
  }

  get settings(): SettingsStore {
    if (!this.settingsStore) {
      throw new Error("[fishing] settings are not ready yet");
    }
    return this.settingsStore;
  }

  /** Persistent time of day and weather front, shared by every screen. */
  get clock(): WorldClock {
    if (!this.worldClock) {
      throw new Error("[fishing] world clock is not ready yet");
    }
    return this.worldClock;
  }

  /** Player progress: codex, area visits and the selected water body. */
  get progress(): ProgressTracker {
    if (!this.progressTracker) {
      throw new Error("[fishing] progress is not ready yet");
    }
    return this.progressTracker;
  }

  get area(): AreaDef {
    return AREA_BY_ID[this.areaId] ?? AREA_BY_ID[DEFAULT_AREA_ID];
  }

  /**
   * The selected water body, falling back to the default one. A saved or
   * hand-passed id that no longer exists (a renamed area, a stale session) used
   * to reach the screen as `undefined` and crash on `area.layout`.
   */
  get areaId(): AreaId {
    const saved = this.progressTracker?.snapshot.selectedArea;
    return saved && saved in AREA_BY_ID ? saved : DEFAULT_AREA_ID;
  }

  get muted(): boolean {
    return this.audioKit?.isMuted ?? this.options.muted;
  }

  protected tick = (): void => {
    if (this.destroyed) return;
    const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05);
    if (this.bootLayer) {
      return;
    }
    this.screens.update(dt);
    this.updateCursor();
  };
  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
    this.settings.muted = muted;
    this.screens.active?.onMuteChanged();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  protected isEngaged(): boolean {
    const canvas = this.app.canvas;
    return (
      document.activeElement === canvas ||
      this.pointerInside ||
      this.options.container.contains(document.activeElement)
    );
  }

  protected focusCanvas = (): void => {
    this.audio.unlock();
    this.app.canvas.focus({ preventScroll: true });
  };

  protected onPointerEnter = (event: PointerEvent): void => {
    this.onCursorMove(event);
  };

  protected onPointerLeave = (): void => {
    this.pointerInside = false;
    this.cursorOverlay?.hide();
  };

  protected onCursorMove = (event: PointerEvent): void => {
    const rect = this.app.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.cursorX =
      (event.clientX - rect.left) * (this.app.screen.width / rect.width);
    this.cursorY =
      (event.clientY - rect.top) * (this.app.screen.height / rect.height);
    this.pointerInside = true;
    this.updateCursor();
  };

  protected abstract applyResize(): void;
  protected abstract updateCursor(): void;
  protected abstract toggleAudioPanel(): void;
  protected abstract toggleDevPanel(): void;
}
