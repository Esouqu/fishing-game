import { Graphics, Text, TextStyle } from "pixi.js";
import { C, FONT_FAMILY } from "../config";

export const FONT_STACK = `${FONT_FAMILY}, "Courier New", monospace`;

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
    fontFamily: FONT_STACK,
    fontSize: options.size ?? 10,
    fontWeight: String(options.weight ?? 500) as TextStyle["fontWeight"],
    fill: options.color ?? C.cream,
    align: options.align ?? "left",
    letterSpacing: options.letterSpacing ?? 0,
    lineHeight: options.lineHeight,
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
  const border = options.border ?? C.ink;
  const highlight = options.highlight ?? C.steel;
  const alpha = options.alpha ?? 0.96;

  if (options.shadow) {
    g.rect(x + 3, y + 3, width, height).fill({ color: C.ink, alpha: 0.35 });
  }
  g.rect(x, y, width, height).fill({ color: fill, alpha });
  g.rect(x, y, width, height).stroke({ width: 1, color: border, alignment: 0 });
  if (options.inner !== false) {
    g.rect(x + 1, y + 1, width - 2, 1).fill({ color: highlight, alpha: 0.35 });
    g.rect(x + 1, y + 1, 1, height - 2).fill({ color: highlight, alpha: 0.18 });
    g.rect(x + 1, y + height - 2, width - 2, 1).fill({
      color: C.ink,
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
