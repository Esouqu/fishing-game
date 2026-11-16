import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { currentFontScale, currentFontStack } from "../fonts";
import type { WeatherId } from "../types";
import { UI } from "./palette";

/**
 * Inset of any full-screen panel from the frame, on all four sides.
 *
 * Each window used to pick its own margins — the water picker 20 px sideways
 * and 37 px top/bottom, the codex 20/8, the help 24/14 — so the same UI read as
 * three differently placed boxes. One inset puts every window in the same spot
 * on the frame.
 */
export const SCREEN_INSET = 12;

/** Padding between a panel's frame and its content, on all four sides. */
export const PANEL_PAD = 16;

export interface TextOptions {
  size?: number;
  color?: number;
  weight?: number;
  align?: "left" | "center" | "right";
  alpha?: number;
  letterSpacing?: number;
  lineHeight?: number;
  /** Wrap long copy at this width (virtual pixels). */
  wordWrapWidth?: number;
}

export function makeText(value: string, options: TextOptions = {}): Text {
  const style = new TextStyle({
    fontFamily: currentFontStack(),
    fontSize: (options.size ?? 10) * currentFontScale(),
    fontWeight: String(options.weight ?? 500) as TextStyle["fontWeight"],
    fill: options.color ?? UI.text,
    align: options.align ?? "left",
    letterSpacing: options.letterSpacing ?? 0,
    lineHeight: options.lineHeight,
    wordWrap: options.wordWrapWidth !== undefined,
    wordWrapWidth: options.wordWrapWidth,
    breakWords: true,
    trim: true,
  });
  const text = new Text({ text: value, style });
  text.resolution = 4;
  text.roundPixels = true;
  text.alpha = options.alpha ?? 1;
  if (options.align === "center") text.anchor.x = 0.5;
  else if (options.align === "right") text.anchor.x = 1;
  return text;
}

export function setText(text: Text, value: string): void {
  if (text.text !== value) text.text = value;
}

/** Width of a compact keycap for a short label, in virtual pixels. */
export function keycapWidth(label: string, fontSize = 6): number {
  const metrics = measureKeycapText(label, fontSize);
  return Math.max(14, Math.ceil(metrics.inkWidth + 6));
}

interface KeycapMetrics {
  advance: number;
  inkLeft: number;
  inkWidth: number;
}

let keycapMeasureCtx: CanvasRenderingContext2D | null = null;

function measureKeycapText(label: string, fontSize: number): KeycapMetrics {
  if (!keycapMeasureCtx) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 32;
    // Every call to measureKeycapText reads the glyph back with getImageData,
    // so this measurement canvas must stay CPU-backed.
    keycapMeasureCtx = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!keycapMeasureCtx) {
    const advance = label.length * 3.1;
    return { advance, inkLeft: 0, inkWidth: advance };
  }

  const ctx = keycapMeasureCtx;
  const originX = 8;
  const originY = 24;
  ctx.font = `700 ${fontSize * currentFontScale()}px ${currentFontStack()}`;
  const advance = ctx.measureText(label).width;
  ctx.clearRect(0, 0, 128, 32);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label, originX, originY);

  const data = ctx.getImageData(0, 0, 128, 32).data;
  let minX = 128;
  let maxX = -1;
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      if (data[(y * 128 + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (maxX < minX) {
    return { advance, inkLeft: 0, inkWidth: Math.max(1, advance) };
  }
  return {
    advance,
    inkLeft: minX - originX,
    inkWidth: maxX - minX + 1,
  };
}

/**
 * Two-band pixel frame used by every panel and card in the UI: an indigo outer
 * outline and a periwinkle inner hairline. The bands stay 1 px so the interface
 * keeps the hard edge of the pixel art around it; `radius` exists only for the
 * few small chips that already had slightly clipped corners.
 */
export function drawPanelFrame(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 0,
): void {
  const r = Math.min(radius, Math.floor(Math.min(w, h) / 2));
  if (r > 0) {
    g.roundRect(x, y, w, h, r).stroke({
      width: 1,
      color: UI.ink,
      alignment: 0,
    });
    g.roundRect(x + 1, y + 1, w - 2, h - 2, Math.max(1, r - 1)).stroke({
      width: 1,
      color: UI.periwinkle,
      alpha: 0.55,
    });
  } else {
    g.rect(x, y, w, h).stroke({ width: 1, color: UI.ink, alignment: 0 });
    g.rect(x + 1, y + 1, w - 2, h - 2).stroke({
      width: 1,
      color: UI.periwinkle,
      alpha: 0.55,
    });
  }
}

/**
 * Small bordered keycap used by control guides.
 *
 * `flat` drops the raised wood frame and keeps a single hairline edge, for
 * chips that sit inside another panel and should not read as a second button.
 */
export function makeKeycap(
  label: string,
  height = 11,
  fontSize = 6,
  flat = false,
): Container {
  const metrics = measureKeycapText(label, fontSize);
  const width = Math.max(14, Math.ceil(metrics.inkWidth + 6));
  const container = new Container();
  const g = new Graphics();
  if (flat) {
    // Opaque on purpose: the chip sits over open water, and a translucent panel
    // let the ripples read through the letters.
    g.roundRect(0, 0, width, height, 2).fill({ color: UI.panelAlt, alpha: 1 });
    g.roundRect(0.5, 0.5, width - 1, height - 1, 2).stroke({
      width: 1,
      color: UI.periwinkle,
      alpha: 0.8,
    });
  } else {
    g.roundRect(0, 0, width, height, 2).fill(UI.panelAlt);
    drawPanelFrame(g, 0, 0, width, height, 2);
    g.rect(1, 1, width - 2, 1).fill({
      color: UI.periwinklePale,
      alpha: 0.5,
    });
    g.rect(1, height - 1, width - 2, 1).fill({ color: UI.ink, alpha: 0.4 });
  }
  container.addChild(g);

  const text = makeText(label, {
    size: fontSize,
    color: UI.text,
    weight: 700,
    align: "center",
    lineHeight: height,
  });
  text.anchor.set(0.5, 0.5);
  text.position.set(width / 2, height / 2);
  container.addChild(text);
  return container;
}

export interface PanelOptions {
  fill?: number;
  alpha?: number;
  border?: number;
  highlight?: number;
  shadow?: boolean;
  inner?: boolean;
}

/** Pixel panel: flat fill, indigo outline, periwinkle hairline and a 1 px bevel. */
export function drawPanel(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PanelOptions = {},
): void {
  const fill = options.fill ?? UI.panel;
  const alpha = options.alpha ?? 0.95;

  if (options.shadow) {
    g.rect(x + 3, y + 3, width, height).fill({ color: UI.ink, alpha: 0.3 });
  }
  g.rect(x, y, width, height).fill({ color: fill, alpha });
  drawPanelFrame(g, x, y, width, height);
  if (options.inner !== false) {
    g.rect(x + 2, y + 2, width - 4, 1).fill({
      color: UI.periwinklePale,
      alpha: 0.45,
    });
    g.rect(x + 2, y + 2, 1, height - 4).fill({
      color: UI.periwinklePale,
      alpha: 0.2,
    });
    g.rect(x + 2, y + height - 3, width - 4, 1).fill({
      color: UI.ink,
      alpha: 0.55,
    });
    g.rect(x + width - 3, y + 2, 1, height - 4).fill({
      color: UI.ink,
      alpha: 0.25,
    });
  }
}

export function drawPauseIcon(g: Graphics, color: number = UI.text): void {
  g.clear();
  g.rect(4, 3, 3, 10).fill(color);
  g.rect(9, 3, 3, 10).fill(color);
}

export function drawPlayIcon(g: Graphics, color: number = UI.text): void {
  g.clear();
  g.moveTo(5, 3).lineTo(12, 8).lineTo(5, 13).closePath().fill(color);
}

/** Small pixel fish silhouette used as a decorative bullet. */
export function drawFishGlyph(g: Graphics, color: number): void {
  g.clear();
  g.rect(4, 3, 7, 6).fill(color);
  g.rect(2, 3, 2, 2).fill(color);
  g.rect(2, 7, 2, 2).fill(color);
  g.rect(1, 5, 1, 2).fill(color);
  g.rect(11, 4, 2, 4).fill({ color, alpha: 0.8 });
  g.rect(8, 4, 1, 1).fill(UI.ink);
}

/**
 * One colour per front. Used three ways — the medallion ring, the glyph itself
 * and the wash behind the column — so a badge can never disagree with the sky
 * it names.
 */
export const WEATHER_TINT: Record<WeatherId, number> = {
  clear: UI.amber,
  // Overcast is a grey lid, so its wash is the only neutral one on the rail.
  overcast: UI.textMuted,
  snow: UI.ice,
  blizzard: UI.ice,
  fog: UI.periwinkle,
};

/**
 * 12×12 pixel weather glyph. Drawn from the same 1-px grid as the rest of the
 * UI so it stays legible when the canvas is scaled up.
 *
 * `tint` is the front's own colour and is used for every body shape, so the
 * glyph reads as one object with the medallion that rings it instead of a grey
 * cloud sitting inside a coloured badge. Only the specular pixels stay neutral.
 */
export function drawWeatherIcon(
  g: Graphics,
  weather: WeatherId,
  tint: number = WEATHER_TINT[weather],
): void {
  g.clear();
  const cloud = (top: number): void => {
    g.rect(3, top + 3, 7, 3).fill(tint);
    g.rect(4, top + 1, 4, 3).fill(tint);
    g.rect(2, top + 5, 9, 2).fill(tint);
    g.rect(4, top + 2, 3, 1).fill({ color: UI.text, alpha: 0.4 });
  };

  switch (weather) {
    case "clear":
      g.rect(5, 0, 2, 2).fill(tint);
      g.rect(5, 10, 2, 2).fill(tint);
      g.rect(0, 5, 2, 2).fill(tint);
      g.rect(10, 5, 2, 2).fill(tint);
      g.rect(2, 2, 1, 1).fill({ color: tint, alpha: 0.7 });
      g.rect(9, 2, 1, 1).fill({ color: tint, alpha: 0.7 });
      g.rect(2, 9, 1, 1).fill({ color: tint, alpha: 0.7 });
      g.rect(9, 9, 1, 1).fill({ color: tint, alpha: 0.7 });
      g.rect(4, 3, 4, 6).fill(tint);
      g.rect(3, 4, 6, 4).fill(tint);
      g.rect(5, 4, 2, 2).fill(UI.legendary);
      break;
    case "overcast":
      cloud(2);
      break;
    case "snow":
      // Snow falls as flakes, never as drops: three little crosses under the
      // cloud, so the icon cannot be misread as rain over a frozen lake.
      cloud(0);
      for (const [x, y] of [
        [3, 9],
        [6, 10],
        [9, 9],
      ] as const) {
        g.rect(x - 1, y, 3, 1).fill(tint);
        g.rect(x, y - 1, 1, 3).fill(tint);
      }
      break;
    case "blizzard":
      // A blown flake: the cloud plus horizontal snow streaks, no lightning.
      cloud(0);
      g.rect(2, 9, 4, 1).fill(tint);
      g.rect(7, 10, 3, 1).fill({ color: tint, alpha: 0.8 });
      g.rect(3, 11, 3, 1).fill({ color: tint, alpha: 0.6 });
      g.rect(8, 8, 1, 1).fill(UI.text);
      g.rect(1, 10, 1, 1).fill(UI.text);
      break;
    case "fog":
      cloud(0);
      g.rect(1, 9, 6, 1).fill({ color: tint, alpha: 0.85 });
      g.rect(6, 11, 5, 1).fill({ color: tint, alpha: 0.6 });
      break;
  }
}
