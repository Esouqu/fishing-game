import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { C } from "../config";
import { currentFontScale, currentFontStack } from "../fonts";

export interface TextOptions {
  size?: number;
  color?: number;
  weight?: number;
  align?: "left" | "center" | "right";
  alpha?: number;
  letterSpacing?: number;
  lineHeight?: number;
}

export function makeText(value: string, options: TextOptions = {}): Text {
  const style = new TextStyle({
    fontFamily: currentFontStack(),
    fontSize: (options.size ?? 10) * currentFontScale(),
    fontWeight: String(options.weight ?? 500) as TextStyle["fontWeight"],
    fill: options.color ?? C.cream,
    align: options.align ?? "left",
    letterSpacing: options.letterSpacing ?? 0,
    lineHeight: options.lineHeight,
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
    keycapMeasureCtx = canvas.getContext("2d");
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

/** Two-band wooden border used by every panel and card in the UI. */
export function drawWoodFrame(
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
      color: C.ink,
      alignment: 0,
    });
    g.roundRect(x + 1, y + 1, w - 2, h - 2, Math.max(1, r - 1)).stroke({
      width: 1,
      color: C.brownDark,
      alpha: 0.9,
    });
  } else {
    g.rect(x, y, w, h).stroke({ width: 1, color: C.ink, alignment: 0 });
    g.rect(x + 1, y + 1, w - 2, h - 2).stroke({
      width: 1,
      color: C.brownDark,
      alpha: 0.9,
    });
  }
}

/** Small bordered keycap used by control guides. */
export function makeKeycap(
  label: string,
  height = 11,
  fontSize = 6,
): Container {
  const metrics = measureKeycapText(label, fontSize);
  const width = Math.max(14, Math.ceil(metrics.inkWidth + 6));
  const container = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, width, height, 2).fill(C.panelAlt);
  drawWoodFrame(g, 0, 0, width, height, 2);
  g.rect(1, 1, width - 2, 1).fill({ color: C.brownLight, alpha: 0.55 });
  g.rect(1, height - 1, width - 2, 1).fill({ color: C.ink, alpha: 0.4 });
  container.addChild(g);

  const text = makeText(label, {
    size: fontSize,
    color: C.cream,
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

/** Pixel-style panel: flat fill, dark outline, subtle inner highlight. */
export function drawPanel(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PanelOptions = {},
): void {
  const fill = options.fill ?? C.panel;
  const alpha = options.alpha ?? 0.96;

  if (options.shadow) {
    g.rect(x + 3, y + 3, width, height).fill({ color: C.ink, alpha: 0.35 });
  }
  g.rect(x, y, width, height).fill({ color: fill, alpha });
  drawWoodFrame(g, x, y, width, height);
  if (options.inner !== false) {
    g.rect(x + 2, y + 2, width - 4, 1).fill({
      color: C.brownLight,
      alpha: 0.55,
    });
    g.rect(x + 2, y + 2, 1, height - 4).fill({
      color: C.brownLight,
      alpha: 0.28,
    });
    g.rect(x + 2, y + height - 3, width - 4, 1).fill({
      color: C.brownDark,
      alpha: 0.55,
    });
    g.rect(x + width - 3, y + 2, 1, height - 4).fill({
      color: C.brown,
      alpha: 0.25,
    });
  }
}

export function drawSoundIcon(
  g: Graphics,
  muted: boolean,
  color = C.cream,
): void {
  g.clear();
  g.rect(2, 6, 3, 4).fill(color);
  g.moveTo(5, 6)
    .lineTo(9, 3)
    .lineTo(9, 13)
    .lineTo(5, 10)
    .closePath()
    .fill(color);
  if (muted) {
    g.rect(11, 6, 1, 1).fill(C.red);
    g.rect(12, 7, 1, 2).fill(C.red);
    g.rect(13, 9, 1, 1).fill(C.red);
    g.rect(11, 10, 1, 1).fill(C.red);
    g.rect(10, 7, 1, 2).fill(C.red);
    g.rect(14, 7, 1, 2).fill(C.red);
  } else {
    g.rect(11, 6, 1, 4).fill(color);
    g.rect(13, 4, 1, 8).fill({ color, alpha: 0.8 });
  }
}

export function drawPauseIcon(g: Graphics, color = C.cream): void {
  g.clear();
  g.rect(4, 3, 3, 10).fill(color);
  g.rect(9, 3, 3, 10).fill(color);
}

export function drawPlayIcon(g: Graphics, color = C.cream): void {
  g.clear();
  g.moveTo(5, 3).lineTo(12, 8).lineTo(5, 13).closePath().fill(color);
}

export function drawChevron(
  g: Graphics,
  x: number,
  y: number,
  direction: "left" | "right",
  color = C.ink,
): void {
  g.clear();
  if (direction === "left") {
    g.moveTo(x + 5, y)
      .lineTo(x, y + 4)
      .lineTo(x + 5, y + 8)
      .stroke({
        width: 2,
        color,
      });
  } else {
    g.moveTo(x, y)
      .lineTo(x + 5, y + 4)
      .lineTo(x, y + 8)
      .stroke({
        width: 2,
        color,
      });
  }
}

/** Small pixel fish silhouette used as a decorative bullet. */
export function drawFishGlyph(g: Graphics, color: number): void {
  g.clear();
  g.rect(4, 3, 7, 6).fill(color);
  g.rect(2, 3, 2, 2).fill(color);
  g.rect(2, 7, 2, 2).fill(color);
  g.rect(1, 5, 1, 2).fill(color);
  g.rect(11, 4, 2, 4).fill({ color, alpha: 0.8 });
  g.rect(8, 4, 1, 1).fill(C.ink);
}
