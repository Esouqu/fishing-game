import { Container, Graphics, Rectangle, Texture } from "pixi.js";
import { C, VIEW } from "./config";
import { WINTER, winterWaterAt } from "./world";
import type { HelpPageId } from "./texts";
import { AREA_BY_ID, AREAS, DEFAULT_AREA_ID, type AreaDef } from "./areas";
import { drawFishGlyph, drawPanel } from "./ui/theme";
import { UI } from "./ui/palette";
import { loadGameAssets, loadHelpTexture, prefetchHelpPages } from "./assets";
import { createFishingScene } from "./game/scenes";
import { IceVeil } from "./ui/IceVeil";
import { SettingsStore, WorldStore } from "./storage";
import { WorldClock } from "./world";
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

export abstract class GameBootLayer extends GameBase {
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
    drawFishGlyph(glyph, UI.primary);
    glyph.position.set(205, 62);
    glyph.scale.set(5);

    const barBg = new Graphics();
    drawPanel(barBg, 150, 156, 180, 14, { fill: UI.ink, inner: false });

    this.bootFill = new Graphics();
    this.bootMarker = new Graphics();
    this.bootMarker.rect(-2, -4, 5, 4).fill(UI.ink);
    this.bootMarker.rect(-1, -3, 3, 2).fill(UI.rose);
    this.bootMarker.rect(-1, -1, 3, 1).fill(UI.text);
    this.bootMarker.rect(0, -6, 1, 2).fill(UI.ink);
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

  protected setBootProgress(progress: number): void {
    if (!this.bootFill) return;
    const clamped = Math.max(0.02, Math.min(1, progress));
    this.bootFill.clear();
    this.bootFill
      .rect(152, 158, 176 * clamped, 10)
      .fill({ color: UI.periwinkle, alpha: 0.95 });
    this.bootFill
      .rect(152, 158, 176 * clamped, 2)
      .fill({ color: UI.primary, alpha: 0.9 });
  }

  protected unmountBoot(): void {
    if (!this.bootLayer) return;
    this.world.removeChild(this.bootLayer);
    this.bootLayer.destroy({ children: true });
    this.bootLayer = null;
    this.bootMarker = null;
    this.bootFill = null;
  }
  protected abstract mountCursor(cursors: CursorTextures): void;
  abstract showMenu(): void;
  abstract startGame(areaId?: AreaId): void;
}
