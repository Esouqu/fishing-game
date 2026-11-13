import { Application, Container, Graphics } from "pixi.js";
import { C, VIEW } from "./config";
import { WINTER, winterWaterAt } from "./world";
import { TEXT } from "./texts";
import { CURSORS, type CursorName, type CursorTextures } from "./cursors";
import { AudioKit } from "./audio";
import { loadGameAssets, type AssetBag } from "./assets";
import { Leaderboard, SettingsStore, WorldStore } from "./storage";
import { WorldClock } from "./world";
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
import { CursorOverlay } from "./ui/CursorOverlay";

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
  private worldClock: WorldClock | null = null;

  private bootLayer: Container | null = null;
  private bootMarker: Graphics | null = null;
  private bootFill: Graphics | null = null;
  private bootTime = 0;
  private cursorOverlay: CursorOverlay | null = null;
  private cursorX = 0;
  private cursorY = 0;

  /** Clips all game content to the 480×270 frame inside the letterbox. */
  private readonly worldMask = new Graphics();

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
    const handled = this.screens.active?.handleWheel(event) ?? false;
    if (handled) event.preventDefault();
  };

  private readonly onVisibility = (): void => {
    if (this.destroyed) return;
    if (document.hidden) {
      this.worldClock?.persist();
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

  /** Persistent time of day and weather front, shared by every screen. */
  get clock(): WorldClock {
    if (!this.worldClock) {
      throw new Error("[fishing] world clock is not ready yet");
    }
    return this.worldClock;
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
    this.mountCursor(bag.cursors);
    this.settingsStore = new SettingsStore(this.options.storagePrefix);
    this.leaderboardStore = new Leaderboard(this.options.storagePrefix);
    this.worldClock = new WorldClock(
      new WorldStore(this.options.storagePrefix),
    );
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

    // Winter lake instead of the old summer gradient.
    for (let x = 0; x < VIEW.width; x += 1) {
      bg.rect(x, 0, 1, VIEW.height).fill(winterWaterAt(x / VIEW.width));
    }

    const edge = (y: number): number =>
      54 + Math.sin(y * 0.065) * 3.2 + Math.sin(y * 0.17 + 1.7) * 1.6;
    const snowPoly: number[] = [0, 0];
    for (let y = 0; y <= VIEW.height; y += 2) {
      snowPoly.push(edge(y), y);
    }
    snowPoly.push(0, VIEW.height);
    bg.poly(snowPoly).fill(WINTER.snowShade);
    const innerPoly: number[] = [0, 0];
    for (let y = 0; y <= VIEW.height; y += 2) {
      innerPoly.push(edge(y) - 6, y);
    }
    innerPoly.push(0, VIEW.height);
    bg.poly(innerPoly).fill(WINTER.snow);

    const traceEdge = (offset: number): void => {
      bg.moveTo(edge(0) + offset, 0);
      for (let y = 2; y <= VIEW.height; y += 2) {
        bg.lineTo(edge(y) + offset, y);
      }
    };
    traceEdge(0);
    bg.stroke({ width: 9, color: WINTER.ice });
    traceEdge(-2);
    bg.stroke({ width: 2, color: WINTER.snowLight, alpha: 0.75 });
    traceEdge(1);
    bg.stroke({ width: 2, color: WINTER.iceDeep, alpha: 0.9 });
    traceEdge(0);
    bg.stroke({ width: 1, color: 0x1b4a5e, alpha: 0.55 });

    // Far bank with a snowy pine line.
    const far = 462;
    bg.rect(far, 0, VIEW.width - far, VIEW.height).fill(WINTER.farShore);
    bg.rect(far, 0, 6, VIEW.height).fill(WINTER.farShoreSnow);
    for (let y = -4; y < VIEW.height; y += 17) {
      const top = y + ((y * 5) % 5);
      bg.poly([far + 5, top, far + 18, top + 7, far + 5, top + 14]).fill(
        WINTER.treeDark,
      );
      bg.poly([far + 10, top + 3, far + 22, top + 9, far + 10, top + 15])
        .fill(0x1b3438)
        .rect(far + 8, top + 3, 4, 1)
        .fill({ color: WINTER.farShoreSnow, alpha: 0.8 });
    }

    // A small pier silhouette for context.
    const dockX = 48;
    const dockY = 122;
    const dockW = 124;
    const dockH = 30;
    bg.rect(dockX + 5, dockY + 5, dockW, dockH).fill({
      color: 0x0a2030,
      alpha: 0.4,
    });
    bg.rect(dockX, dockY, dockW, dockH).fill(C.brown);
    bg.rect(dockX, dockY, dockW, 3).fill(C.brownLight);
    bg.rect(dockX, dockY, 2, dockH).fill(C.brownDark);
    bg.rect(dockX + dockW - 2, dockY, 2, dockH).fill(C.brownDark);
    for (let px = dockX + 7; px < dockX + dockW - 2; px += 9) {
      bg.rect(px, dockY + 2, 1, dockH - 4).fill({
        color: C.brownDark,
        alpha: 0.7,
      });
    }
    bg.rect(dockX + 2, dockY + 2, dockW - 4, 2).fill({
      color: WINTER.snow,
      alpha: 0.6,
    });

    // Lantern glow at the pier corner.
    bg.circle(168, 117, 30).fill({ color: 0xffb347, alpha: 0.045 });
    bg.circle(168, 117, 14).fill({ color: 0xffc76b, alpha: 0.07 });
    bg.circle(168, 117, 5).fill({ color: 0xffe3a8, alpha: 0.1 });
    bg.rect(167, 116, 2, 8).fill(C.brownDark);
    bg.rect(164, 113, 8, 2).fill(C.ink);
    bg.rect(165, 116, 6, 5).fill(C.ink);
    bg.rect(166, 117, 4, 3).fill(0xffd166);

    // Sparse snow across the water.
    for (let i = 0; i < 52; i += 1) {
      const x = 60 + ((i * 73) % (VIEW.width - 80));
      const y = 8 + ((i * 37) % (VIEW.height - 20));
      bg.rect(x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1).fill({
        color: WINTER.snow,
        alpha: 0.3 + (i % 4) * 0.12,
      });
    }

    const halo = new Graphics();
    halo.circle(237, 96, 43).fill({ color: WINTER.ice, alpha: 0.05 });

    const glyph = new Graphics();
    drawFishGlyph(glyph, C.gold);
    glyph.position.set(205, 62);
    glyph.scale.set(5);

    const barBg = new Graphics();
    drawPanel(barBg, 150, 156, 180, 14, { fill: C.ink, inner: false });

    this.bootFill = new Graphics();
    this.bootMarker = new Graphics();
    this.bootMarker.rect(-2, -4, 5, 4).fill(C.ink);
    this.bootMarker.rect(-1, -3, 3, 2).fill(C.red);
    this.bootMarker.rect(-1, -1, 3, 1).fill(C.cream);
    this.bootMarker.rect(0, -6, 1, 2).fill(C.ink);
    this.bootMarker.ellipse(0, 0, 5, 1.5).stroke({
      width: 1,
      color: WINTER.ice,
      alpha: 0.6,
    });
    this.bootMarker.position.set(240, 134);

    layer.addChild(bg, halo, glyph, this.bootMarker, barBg, this.bootFill);
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
    const x = Math.round((width - VIEW.width * scale) / 2);
    const y = Math.round((height - VIEW.height * scale) / 2);
    this.world.scale.set(scale);
    this.world.position.set(x, y);
    this.worldMask.scale.set(scale);
    this.worldMask.position.set(x, y);
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
    this.updateCursor();
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

  private onPointerEnter = (event: PointerEvent): void => {
    this.onCursorMove(event);
  };

  private onPointerLeave = (): void => {
    this.pointerInside = false;
    this.cursorOverlay?.hide();
  };

  private onCursorMove = (event: PointerEvent): void => {
    const rect = this.app.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.cursorX =
      (event.clientX - rect.left) * (this.app.screen.width / rect.width);
    this.cursorY =
      (event.clientY - rect.top) * (this.app.screen.height / rect.height);
    this.pointerInside = true;
    this.updateCursor();
  };

  private updateCursor(): void {
    const overlay = this.cursorOverlay;
    if (!overlay) return;
    if (!this.pointerInside) {
      overlay.hide();
      return;
    }

    const target = this.app.renderer.events.rootBoundary.hitTest(
      this.cursorX,
      this.cursorY,
    );
    const token = target?.cursor;
    const name: CursorName =
      token && Object.prototype.hasOwnProperty.call(CURSORS, token)
        ? (token as CursorName)
        : "default";
    overlay.setCursor(name);
    overlay.moveTo(this.cursorX, this.cursorY, this.world.scale.x * 0.5);
  }

  private mountCursor(cursors: CursorTextures): void {
    const overlay = new CursorOverlay(cursors);
    this.cursorOverlay = overlay;
    this.app.stage.addChild(overlay);
    this.app.canvas.classList.add("cursor-hidden");
    this.updateCursor();
  }

  // ---------------------------------------------------------------- teardown

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.worldClock?.persist();
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
