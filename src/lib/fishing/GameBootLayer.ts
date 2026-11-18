import { Container, Graphics, Rectangle, Text, Texture } from "pixi.js";
import { VIEW } from "./config";

import { TEXT, type HelpPageId } from "./texts";
import { AREA_BY_ID, AREAS, DEFAULT_AREA_ID, type AreaDef } from "./areas";
import { drawPanel, makeText, setText } from "./ui/theme";
import { anchorInk, realignInk } from "./ui/textInk";
import { UI } from "./ui/palette";
import { loadGameAssets, loadHelpTexture, prefetchHelpPages } from "./assets";
import { loadCursorTextures } from "./cursors";
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

/** Progress rail of the boot screen; the caption row hangs off its top edge. */
const BAR = { x: 140, y: 144, width: 200, height: 12 } as const;
/** Gap between the caption row and the rail. */
const ROW_GAP = 4;
/** Gap between the rail and the asset name printed under it. */
const FILE_GAP = 3;
/** Longest asset name the boot line prints before it is shortened. */
const BOOT_FILE_MAX = 34;

/** Shortens a file name so the boot line cannot run past the rail. */
function fitLabel(label: string, max: number): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}${TEXT.common.ellipsis}`;
}

export abstract class GameBootLayer extends GameBase {
  /** «ЗАГРУЗКА…» caption over the rail. */
  private bootCaption: Text | null = null;
  /** Percentage under the progress rail. */
  private bootPercent: Text | null = null;
  /** Name of the asset being fetched, under the rail. */
  private bootFile: Text | null = null;

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

    // The game paints the pointer itself, so cursors are the first request of
    // the boot and the overlay is mounted the frame they land. Requesting them
    // last, as part of the art bag, left the whole loading screen without a
    // cursor until the menu was ready.
    const cursorsPromise = loadCursorTextures();
    void cursorsPromise.then((cursors) => {
      if (!this.destroyed) this.mountCursor(cursors);
    });

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
      loadGameAssets(
        this.options.assetBase,
        (progress, label) => {
          this.setBootProgress(progress, label);
        },
        cursorsPromise,
      ),
      progressPromise,
    ]);

    this.assetBag = bag;
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
      bg.rect(0, y, VIEW.width, 1).fill(mixColor(UI.ink, UI.night, t));
    }
    bg.rect(BAR.x, 130, BAR.width, 1).fill({
      color: UI.periwinkle,
      alpha: 0.2,
    });

    // Wordmark: the same title the menu uses, so the first frame already looks
    // like this game and not like a generic loading strip.
    const title = makeText(TEXT.menu.title, {
      size: 22,
      weight: 800,
      color: UI.text,
      align: "center",
      letterSpacing: 0.5,
      outline: true,
    });
    title.position.set(VIEW.width / 2, 92);
    // The wordmark is anchored on its glyphs: the constant text box is almost
    // twice the cap height, and the top of that box pushed it down onto the
    // progress block.
    anchorInk(title, "center", "top");

    // The caption and the percentage are one row over the rail: the caption
    // hangs off the rail's left edge, the number off its right, so the pair
    // reads as the two ends of the bar instead of a centred caption with a
    // stray number under it.
    this.bootCaption = makeText(`${TEXT.boot.loading}${TEXT.common.ellipsis}`, {
      size: 7,
      weight: 800,
      color: UI.textMuted,
      letterSpacing: 1.5,
    });
    anchorInk(this.bootCaption, "left", "bottom");
    this.bootCaption.position.set(BAR.x, BAR.y - ROW_GAP);

    this.bootPercent = makeText("0%", {
      size: 7,
      weight: 800,
      color: UI.text,
      align: "right",
    });
    anchorInk(this.bootPercent, "right", "bottom");
    this.bootPercent.position.set(BAR.x + BAR.width, BAR.y - ROW_GAP);

    const barBg = new Graphics();
    drawPanel(barBg, BAR.x, BAR.y, BAR.width, BAR.height, {
      fill: UI.ink,
      inner: false,
    });

    this.bootFill = new Graphics();

    // The file being fetched, under the rail: the same line as the name of a
    // loading asset in the reference, and the one thing that tells a player
    // staring at a stuck bar that the game is still working.
    this.bootFile = makeText("", {
      size: 6,
      color: UI.textMuted,
      letterSpacing: 0.4,
    });
    anchorInk(this.bootFile, "left", "top");
    this.bootFile.position.set(BAR.x, BAR.y + BAR.height + FILE_GAP);

    layer.addChild(
      bg,
      title,
      this.bootCaption,
      this.bootPercent,
      barBg,
      this.bootFill,
      this.bootFile,
    );
    this.bootLayer = layer;
    this.world.addChild(layer);
    // A small stub so the first painted frame already shows a live rail.
    this.setBootProgress(0.02);
  }

  protected setBootProgress(progress: number, label?: string): void {
    if (!this.bootFill) return;
    const clamped = Math.max(0.02, Math.min(1, progress));
    this.bootFill.clear();
    this.bootFill
      .rect(BAR.x + 2, BAR.y + 2, (BAR.width - 4) * clamped, BAR.height - 4)
      .fill({ color: UI.periwinkle, alpha: 0.95 });
    this.bootFill
      .rect(BAR.x + 2, BAR.y + 2, (BAR.width - 4) * clamped, 2)
      .fill({ color: UI.primary, alpha: 0.9 });
    if (this.bootPercent) {
      this.bootPercent.text = `${Math.round(clamped * 100)}%`;
      realignInk(this.bootPercent);
    }
    if (label !== undefined && this.bootFile) {
      setText(this.bootFile, fitLabel(label, BOOT_FILE_MAX));
    }
  }

  protected unmountBoot(): void {
    if (!this.bootLayer) return;
    this.world.removeChild(this.bootLayer);
    this.bootLayer.destroy({ children: true });
    this.bootLayer = null;
    this.bootFill = null;
    this.bootPercent = null;
    this.bootCaption = null;
    this.bootFile = null;
  }
  protected abstract mountCursor(cursors: CursorTextures): void;
  abstract showMenu(): void;
  abstract startGame(areaId?: AreaId): void;
}
