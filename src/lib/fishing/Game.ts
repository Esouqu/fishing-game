import { Application, Container, Graphics } from "pixi.js";
import { C, VIEW } from "./config";
import { AudioKit } from "./audio";
import { loadGameAssets, type AssetBag } from "./assets";
import { Leaderboard, SettingsStore } from "./storage";
import type {
  FishingGameInstance,
  FishingGameOptions,
  LeaderboardStanding,
  NormalizedOptions,
  SessionResult,
} from "./types";
import { normalizeOptions } from "./types";
import { ScreenManager } from "./ui/ScreenManager";
import { drawFishGlyph, drawPanel } from "./ui/theme";
import { setUiSoundHandler } from "./ui/Button";
import { MenuScreen } from "./screens/MenuScreen";
import { HelpScreen } from "./screens/HelpScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { GameScreen } from "./screens/GameScreen";
import { ResultsScreen } from "./screens/ResultsScreen";

export interface LeaderboardViewOptions {
  highlightId?: string;
  from?: "menu" | "result";
}

export class Game implements FishingGameInstance {
  readonly app: Application;
  readonly options: NormalizedOptions;
  readonly screens = new ScreenManager();
  readonly world = new Container();

  private assetBag: AssetBag | null = null;
  private audioKit: AudioKit | null = null;
  private leaderboardStore: Leaderboard | null = null;
  private settingsStore: SettingsStore | null = null;

  private bootLayer: Container | null = null;
  private bootMarker: Graphics | null = null;
  private bootFill: Graphics | null = null;
  private bootTime = 0;

  private destroyed = false;
  private hostPaused = false;
  private pointerInside = false;
  private readonly resizeObserver: ResizeObserver;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed || !this.isEngaged() || this.assetBag === null) return;
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

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.destroyed || !this.isEngaged() || this.assetBag === null) return;
    this.screens.handleKeyUp(event);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.destroyed || !this.isEngaged() || this.assetBag === null) return;
    this.screens.active?.handleWheel(event);
  };

  private readonly onVisibility = (): void => {
    if (this.destroyed) return;
    if (document.hidden) {
      this.screens.onHostPause(true);
    } else {
      this.screens.onHostPause(this.hostPaused);
    }
  };

  private constructor(app: Application, options: NormalizedOptions) {
    this.app = app;
    this.options = options;
    this.world.eventMode = "static";
    this.app.stage.addChild(this.world);

    this.resizeObserver = new ResizeObserver(() => this.applyResize());
    this.resizeObserver.observe(options.container);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    app.canvas.addEventListener("wheel", this.onWheel);
    document.addEventListener("visibilitychange", this.onVisibility);
    app.canvas.addEventListener("pointerdown", this.focusCanvas);
    app.canvas.addEventListener("pointerenter", this.onPointerEnter);
    app.canvas.addEventListener("pointerleave", this.onPointerLeave);
    app.ticker.add(this.tick);

    setUiSoundHandler((kind) => {
      if (!this.audioKit) return;
      if (kind === "click") this.audioKit.click();
      else this.audioKit.hover();
    });
  }

  static async create(options: FishingGameOptions): Promise<Game> {
    const normalized = normalizeOptions(options);
    const host = normalized.container;
    const width = Math.max(1, Math.floor(host.clientWidth));
    const height = Math.max(1, Math.floor(host.clientHeight));

    const app = new Application();
    await app.init({
      width,
      height,
      background: C.ink,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      roundPixels: true,
      preference: "webgl",
    });
    app.canvas.style.display = "block";
    app.canvas.style.touchAction = "none";
    app.canvas.style.outline = "none";
    app.canvas.tabIndex = 0;
    app.canvas.setAttribute("role", "application");
    app.canvas.setAttribute("aria-label", "Рыбалка «Тихая заводь»");
    host.appendChild(app.canvas);

    const game = new Game(app, normalized);
    game.layout();
    await game.boot();
    return game;
  }

  // --------------------------------------------------------------- accessors

  get assets(): AssetBag {
    if (!this.assetBag) throw new Error("[fishing] assets are not loaded yet");
    return this.assetBag;
  }

  get audio(): AudioKit {
    if (!this.audioKit) throw new Error("[fishing] audio is not ready yet");
    return this.audioKit;
  }

  get leaderboard(): Leaderboard {
    if (!this.leaderboardStore) {
      throw new Error("[fishing] leaderboard is not ready yet");
    }
    return this.leaderboardStore;
  }

  get settings(): SettingsStore {
    if (!this.settingsStore) {
      throw new Error("[fishing] settings are not ready yet");
    }
    return this.settingsStore;
  }

  get muted(): boolean {
    return this.audioKit?.isMuted ?? this.options.muted;
  }

  // -------------------------------------------------------------------- boot

  private async boot(): Promise<void> {
    this.mountBoot();

    const bag = await loadGameAssets(this.options.assetBase, (progress) => {
      this.setBootProgress(progress);
    });

    this.assetBag = bag;
    this.settingsStore = new SettingsStore(this.options.storagePrefix);
    this.leaderboardStore = new Leaderboard(this.options.storagePrefix);
    this.audioKit = new AudioKit(
      this.settingsStore.muted ?? this.options.muted,
    );

    this.unmountBoot();
    this.world.addChild(this.screens.layer);

    if (this.options.startScreen === "game") {
      this.startGame();
    } else {
      this.showMenu();
    }
    this.applyResize();
    this.options.onReady?.();
  }

  private mountBoot(): void {
    const layer = new Container();
    const bg = new Graphics();
    bg.rect(0, 0, VIEW.width, VIEW.height).fill(C.deep);
    bg.rect(0, 90, VIEW.width, 180).fill(C.ocean);
    for (let y = 112; y < 240; y += 16) {
      bg.rect(((y * 7) % 40) + 20, y, 26, 1).fill({
        color: C.cyan,
        alpha: 0.12,
      });
    }

    const glyph = new Graphics();
    drawFishGlyph(glyph, C.gold);
    glyph.position.set(205, 62);
    glyph.scale.set(5);

    const barBg = new Graphics();
    drawPanel(barBg, 150, 156, 180, 14, { fill: C.ink, inner: false });

    this.bootFill = new Graphics();
    this.bootMarker = new Graphics();
    this.bootMarker.rect(-3, -5, 7, 10).fill(C.ink);
    this.bootMarker.rect(-2, -4, 5, 5).fill(C.red);
    this.bootMarker.rect(-2, 1, 5, 4).fill(C.cream);
    this.bootMarker.position.set(240, 134);

    layer.addChild(bg, glyph, this.bootMarker, barBg, this.bootFill);
    this.bootLayer = layer;
    this.world.addChild(layer);
  }

  private setBootProgress(progress: number): void {
    if (!this.bootFill) return;
    const clamped = Math.max(0.02, Math.min(1, progress));
    this.bootFill.clear();
    this.bootFill
      .rect(152, 158, 176 * clamped, 10)
      .fill({ color: C.gold, alpha: 0.95 });
    this.bootFill
      .rect(152, 158, 176 * clamped, 2)
      .fill({ color: C.yellow, alpha: 0.9 });
  }

  private unmountBoot(): void {
    if (!this.bootLayer) return;
    this.world.removeChild(this.bootLayer);
    this.bootLayer.destroy({ children: true });
    this.bootLayer = null;
    this.bootMarker = null;
    this.bootFill = null;
  }

  // ------------------------------------------------------------------ layout

  private layout(): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const scale = Math.min(width / VIEW.width, height / VIEW.height);
    this.world.scale.set(scale);
    this.world.position.set(
      Math.round((width - VIEW.width * scale) / 2),
      Math.round((height - VIEW.height * scale) / 2),
    );
  }

  private applyResize(): void {
    const host = this.options.container;
    const width = Math.max(1, Math.floor(host.clientWidth));
    const height = Math.max(1, Math.floor(host.clientHeight));
    if (
      Math.floor(this.app.screen.width) === width &&
      Math.floor(this.app.screen.height) === height
    ) {
      this.layout();
      return;
    }
    this.app.renderer.resize(width, height);
    this.layout();
  }

  private tick = (): void => {
    if (this.destroyed) return;
    const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05);
    if (this.bootLayer) {
      this.bootTime += dt;
      if (this.bootMarker) {
        this.bootMarker.y = 134 + Math.sin(this.bootTime * 4) * 3;
        this.bootMarker.rotation = Math.sin(this.bootTime * 2) * 0.15;
      }
      return;
    }
    this.screens.update(dt);
  };

  // ----------------------------------------------------------------- screens

  showMenu(): void {
    this.screens.show(new MenuScreen(this));
  }

  showHelp(): void {
    this.screens.show(new HelpScreen(this));
  }

  showLeaderboard(view: LeaderboardViewOptions = {}): void {
    this.screens.show(new LeaderboardScreen(this, view));
  }

  startGame(): void {
    this.screens.show(new GameScreen(this));
  }

  showResults(
    result: SessionResult,
    notify = true,
    standing?: LeaderboardStanding,
  ): void {
    if (notify) this.options.onScore?.(result);
    this.screens.show(new ResultsScreen(this, result, standing));
  }

  submitScore(name: string, result: SessionResult): LeaderboardStanding {
    return this.leaderboard.submit(name, result);
  }

  exit(): void {
    this.options.onExit?.();
  }

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
    this.settings.muted = muted;
    this.screens.active?.onMuteChanged();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  restart(): void {
    this.startGame();
  }

  pause(): void {
    this.hostPaused = true;
    this.screens.onHostPause(true);
  }

  resume(): void {
    this.hostPaused = false;
    this.screens.onHostPause(false);
  }

  // ------------------------------------------------------------------ input

  private isEngaged(): boolean {
    const canvas = this.app.canvas;
    return (
      document.activeElement === canvas ||
      this.pointerInside ||
      this.options.container.contains(document.activeElement)
    );
  }

  private focusCanvas = (): void => {
    this.audio.unlock();
    this.app.canvas.focus({ preventScroll: true });
  };

  private onPointerEnter = (): void => {
    this.pointerInside = true;
  };

  private onPointerLeave = (): void => {
    this.pointerInside = false;
  };

  // ---------------------------------------------------------------- teardown

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.resizeObserver.disconnect();
    this.app.canvas.removeEventListener("pointerdown", this.focusCanvas);
    this.app.canvas.removeEventListener("pointerenter", this.onPointerEnter);
    this.app.canvas.removeEventListener("pointerleave", this.onPointerLeave);
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
