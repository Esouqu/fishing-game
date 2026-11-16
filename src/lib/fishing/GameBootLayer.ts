import { Container, Graphics, Rectangle, Text, Texture } from "pixi.js";
import { VIEW } from "./config";

import { TEXT, type HelpPageId } from "./texts";
import { AREA_BY_ID, AREAS, DEFAULT_AREA_ID, type AreaDef } from "./areas";
import { drawPanel, makeText } from "./ui/theme";
import { UI } from "./ui/palette";
import { loadGameAssets, loadHelpTexture, prefetchHelpPages } from "./assets";
import { createFishingScene } from "./game/scenes";
import { IceVeil } from "./ui/IceVeil";
import { SettingsStore, WorldStore } from "./storage";
import { mixColor, WorldClock } from "./world";
import { AudioKit } from "./audio";
import { mixWith } from "./audioMix";
import {
  LocalProgressRepository,
  ProgressTracker,
  parseProgress,
} from "./progress";
import type { CursorTextures } from "./cursors";
import type { AreaId } from "./types";
import { GameBase } from "./GameBase";

/** Minimum time the loading screen stays up, in milliseconds. */
const BOOT_MIN_MS = 1300;

export abstract class GameBootLayer extends GameBase {
  /** Percentage under the progress rail. */
  private bootPercent: Text | null = null;

  previewFor(areaId: AreaId): Texture {
    const ready = this.previews[areaId] ?? this.previews[DEFAULT_AREA_ID];
    if (ready) return ready;
    // The two water bodies that are not selected are rendered on idle after
    // the menu is up; until then the cheap gradient stands in for them.
    let fallback = this.fallbackPreviews.get(areaId);
    if (!fallback) {
      fallback = this.fallbackPreview(AREA_BY_ID[areaId] ?? this.area);
      this.fallbackPreviews.set(areaId, fallback);
    }
    return fallback;
  }

  /** Help screenshots are lazy: the screen paints first, the shot follows. */
  helpTexture(page: HelpPageId): Promise<Texture> {
    return loadHelpTexture(page);
  }

  protected async boot(): Promise<void> {
    const startedAt = performance.now();
    this.mountBoot();

    // Decorative frost over every screen. It is fetched alongside the rest of
    // the art but never awaited: a missing or slow ice.png must not hold the
    // boot screen, and the veil is attached whenever it arrives.
    const veil = IceVeil.load();

    const repository =
      this.options.progress ??
      new LocalProgressRepository(this.options.storagePrefix);
    const progressPromise = repository.load().catch((error: unknown) => {
      console.warn("[fishing] progress load failed", error);
      return null;
    });

    const [bag, rawProgress] = await Promise.all([
      loadGameAssets(this.options.assetBase, (progress) => {
        this.setBootProgress(progress);
      }),
      progressPromise,
    ]);

    this.assetBag = bag;
    this.mountCursor(bag.cursors);
    this.settingsStore = new SettingsStore(this.options.storagePrefix);
    this.worldClock = new WorldClock(
      new WorldStore(this.options.storagePrefix),
    );
    this.audioKit = new AudioKit(
      this.settingsStore.muted ?? this.options.muted,
      this.options.assetBase,
      mixWith(this.settingsStore.mix),
    );
    this.progressTracker = new ProgressTracker(
      repository,
      parseProgress(rawProgress),
    );
    this.progressTracker.onChange = (snapshot) =>
      this.options.onProgress?.(snapshot);

    // Menus show a still of the selected water body, so the water bed starts
    // with the boot instead of the first cast. Web Audio only begins on the
    // first gesture, which `AudioKit.unlock` handles.
    this.audioKit.setAmbience(this.areaId);

    // Only the selected water body is rendered before the menu. The other two
    // previews are three full scene draws each; on software rendering they
    // were the last two long tasks of the boot, for pictures nobody was
    // looking at yet.
    this.buildAreaPreview(this.area);

    // A warm cache can finish the whole load in two frames. The loading screen
    // is a designed beat, so it gets a moment to be seen: complete the rail and
    // hold it for the rest of the minimum, then hand over to the menu.
    this.setBootProgress(1);
    const left = BOOT_MIN_MS - (performance.now() - startedAt);
    if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));

    this.unmountBoot();
    this.world.addChild(this.screens.layer);
    void veil.then((overlay) => {
      if (overlay && !this.destroyed) this.screens.setVeil(overlay);
      else overlay?.destroy({ children: true });
    });

    if (this.options.startScreen === "game") {
      this.startGame();
    } else {
      this.showMenu();
    }
    this.applyResize();
    this.options.onReady?.();
    this.warmInBackground();
  }

  protected warmInBackground(): void {
    const run = (): void => {
      if (this.destroyed) return;
      for (const area of AREAS) this.buildAreaPreview(area);
      void prefetchHelpPages();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1500 });
    } else {
      window.setTimeout(run, 300);
    }
  }

  /**
   * Renders one scene once and keeps the resulting texture. Cards and menu
   * backdrops then show a real screenshot of the water body instead of a
   * hand-drawn approximation.
   */
  protected buildAreaPreview(area: AreaDef): void {
    if (!this.assetBag || this.previews[area.id]) return;
    const scene = createFishingScene(area, this.assetBag);
    try {
      scene.update(1 / 60);
      this.previews[area.id] = this.app.renderer.extract.texture({
        target: scene,
        frame: new Rectangle(0, 0, VIEW.width, VIEW.height),
        resolution: 1,
      });
    } catch (error) {
      console.warn(`[fishing] preview for ${area.id} failed`, error);
      this.previews[area.id] = this.fallbackPreview(area);
    } finally {
      scene.destroy({ children: true });
    }
  }

  /** The area picker needs all three cards, all with real screenshots. */
  protected ensureAreaPreviews(): void {
    for (const area of AREAS) this.buildAreaPreview(area);
  }

  protected fallbackPreview(area: AreaDef): Texture {
    const canvas = document.createElement("canvas");
    canvas.width = VIEW.width;
    canvas.height = VIEW.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Texture.WHITE;
    const stops = area.palette.waterStops;
    const gradient = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    for (const stop of stops) {
      gradient.addColorStop(
        stop.at,
        `#${stop.color.toString(16).padStart(6, "0")}`,
      );
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = `#${area.palette.farShore.toString(16).padStart(6, "0")}`;
    ctx.fillRect(0, 0, VIEW.width, 26);
    ctx.fillStyle = `#${area.palette.snow.toString(16).padStart(6, "0")}`;
    ctx.fillRect(0, 24, VIEW.width, 3);
    const texture = Texture.from(canvas);
    texture.source.scaleMode = "nearest";
    return texture;
  }
  protected mountBoot(): void {
    const layer = new Container();
    const bg = new Graphics();
    // Practical, not scenic: a calm two-step background that carries the title
    // and the progress, nothing that has to be read while the game is loading.
    for (let y = 0; y < VIEW.height; y += 1) {
      const t = y / VIEW.height;
      bg.rect(0, y, VIEW.width, 1).fill(mixColor(0x141d33, 0x232a56, t));
    }
    bg.rect(140, 130, 200, 1).fill({ color: UI.periwinkle, alpha: 0.2 });

    // Wordmark: the same title the menu uses, so the first frame already looks
    // like this game and not like a generic loading strip.
    const title = makeText(TEXT.menu.title, {
      size: 22,
      weight: 800,
      color: UI.text,
      align: "center",
      letterSpacing: 0.5,
    });
    title.position.set(VIEW.width / 2, 92);
    title.style.stroke = { color: UI.ink, width: 3 };

    const caption = makeText(TEXT.boot.loading, {
      size: 7,
      color: UI.textMuted,
      align: "center",
      letterSpacing: 3,
    });
    caption.position.set(VIEW.width / 2, 116);

    // One clear job: a wide rail with the percentage under it.
    const barBg = new Graphics();
    drawPanel(barBg, 140, 144, 200, 12, { fill: UI.ink, inner: false });

    this.bootFill = new Graphics();

    this.bootPercent = makeText("0%", {
      size: 6,
      color: UI.textMuted,
      align: "center",
    });
    this.bootPercent.anchor.set(0.5, 0.5);
    this.bootPercent.position.set(VIEW.width / 2, 166);

    layer.addChild(bg, title, caption, barBg, this.bootFill, this.bootPercent);
    this.bootLayer = layer;
    this.world.addChild(layer);
    // A small stub so the first painted frame already shows a live rail.
    this.setBootProgress(0.02);
  }

  protected setBootProgress(progress: number): void {
    if (!this.bootFill) return;
    const clamped = Math.max(0.02, Math.min(1, progress));
    this.bootFill.clear();
    this.bootFill
      .rect(142, 146, 196 * clamped, 8)
      .fill({ color: UI.periwinkle, alpha: 0.95 });
    this.bootFill
      .rect(142, 146, 196 * clamped, 2)
      .fill({ color: UI.primary, alpha: 0.9 });
    if (this.bootPercent) {
      this.bootPercent.text = `${Math.round(clamped * 100)}%`;
    }
  }

  protected unmountBoot(): void {
    if (!this.bootLayer) return;
    this.world.removeChild(this.bootLayer);
    this.bootLayer.destroy({ children: true });
    this.bootLayer = null;
    this.bootFill = null;
    this.bootPercent = null;
  }
  protected abstract mountCursor(cursors: CursorTextures): void;
  abstract showMenu(): void;
  abstract startGame(areaId?: AreaId): void;
}
